#!/usr/bin/env python3
"""
Melix Status Bot — Discord bot with auto-polling status updates
Built for the Melix Status API (https://melix-status.vercel.app)

Setup
-----
1. pip install discord.py aiohttp python-dotenv
2. Create a .env file or set environment variables:
   DISCORD_TOKEN=your_bot_token
   STATUS_CHANNEL_ID=channel_id_here
   MELIX_API_KEY=mlx_your_key_here
   MELIX_API_BASE=https://melix-status.vercel.app
3. python bot.py

Features
--------
- Announces status page link on startup in the configured channel
- Polls /api/bot/poll every 30s and posts incident/status change embeds
- !status         — show current overall status + all services
- !incidents      — list recent incidents
- !services       — list all services with uptime
- !statuspage     — post the status page link
- !poll           — check for updates immediately
- !botinfo        — bot info and API status
"""

import os
import asyncio
from datetime import datetime, timezone

import aiohttp
import discord
from discord.ext import tasks, commands
from dotenv import load_dotenv

load_dotenv()

API_BASE = os.getenv("MELIX_API_BASE", "https://melix-status.vercel.app")
API_KEY = os.getenv("MELIX_API_KEY", "")
TOKEN = os.getenv("DISCORD_TOKEN", "")
CHANNEL_ID = int(os.getenv("STATUS_CHANNEL_ID", "0"))
STATUS_PAGE_URL = os.getenv("STATUS_PAGE_URL", "http://status.melixbot.xyz/")
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "30"))

IMPACT_COLORS = {
    "none": 0x8B929E,
    "minor": 0xEAB308,
    "major": 0xF97316,
    "critical": 0xEF4444,
    "maintenance": 0x2DD4E8,
}

STATUS_COLORS = {
    "operational": 0x22C55E,
    "degraded": 0xEAB308,
    "partial_outage": 0xF97316,
    "major_outage": 0xEF4444,
    "maintenance": 0x2DD4E8,
}


class MelixStatusBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(command_prefix="!", intents=intents, help_command=None)
        self.session: aiohttp.ClientSession | None = None
        self.since = datetime.now(timezone.utc).isoformat()
        self.channel: discord.TextChannel | None = None
        self.startup_announced = False

    async def setup_hook(self):
        self.session = aiohttp.ClientSession(
            headers={
                "X-API-Key": API_KEY,
                "Accept": "application/json",
            },
            timeout=aiohttp.ClientTimeout(total=15),
        )

    async def on_ready(self):
        print(f"✓ Logged in as {self.user} (ID: {self.user.id})")
        self.channel = self.get_channel(CHANNEL_ID)

        if self.channel is None:
            print(f"✗ Channel {CHANNEL_ID} not found — trying to fetch...")
            try:
                self.channel = await self.fetch_channel(CHANNEL_ID)
            except Exception as e:
                print(f"✗ Cannot find channel: {e}")
                return

        print(f"✓ Status channel: #{self.channel.name} ({self.channel.id})")

        if not self.startup_announced:
            await self.announce_startup()
            self.startup_announced = True

        if not self.poll_status.is_running():
            self.poll_status.start()

    async def on_resumed(self):
        """Re-announce if reconnecting after disconnect."""
        if not self.poll_status.is_running():
            self.poll_status.start()

    # ── Startup announcement ──────────────────────────────────────

    async def announce_startup(self):
        """Post a rich startup card in the status channel."""
        if self.channel is None:
            return

        try:
            snap = await self.api_get("/api/bot/overall")
            services = await self.api_get("/api/bot/services")
            incidents = await self.api_get("/api/bot/incidents?active=1")
        except Exception as e:
            print(f"Startup fetch failed: {e}")
            snap = None
            services = []
            incidents = []

        overall = snap or {}
        status_color = STATUS_COLORS.get(
            overall.get("status", "unknown"), 0x8B929E
        )
        status_label = overall.get("label", "Unknown")

        active_count = len(incidents) if isinstance(incidents, list) else 0

        embed = discord.Embed(
            title="🟢 Melix Status — Online",
            description=f"Status monitoring is now active. Updates will be posted automatically in this channel.",
            url=STATUS_PAGE_URL,
            color=status_color,
            timestamp=datetime.now(timezone.utc),
        )
        embed.add_field(
            name="Current Status",
            value=status_label,
            inline=True,
        )
        embed.add_field(
            name="Services",
            value=f"{len(services)} monitored",
            inline=True,
        )
        embed.add_field(
            name="Active Incidents",
            value=str(active_count),
            inline=True,
        )

        if services:
            svc_lines = []
            for s in services[:12]:
                emoji = "🟢" if s.get("status") == "operational" else "🟡" if s.get("status") == "degraded" else "🔴"
                svc_lines.append(f"{emoji} **{s['name']}** — {s.get('statusLabel', s.get('status', '?'))}")
            embed.add_field(
                name="Service Overview",
                value="\n".join(svc_lines) if svc_lines else "—",
                inline=False,
            )

        embed.add_field(
            name="Status Page",
            value=f"[{STATUS_PAGE_URL}]({STATUS_PAGE_URL})",
            inline=False,
        )
        embed.set_footer(text="Melix Status Bot · Polling every 30s")

        try:
            await self.channel.send(embed=embed)
        except Exception as e:
            print(f"Failed to send startup embed: {e}")

    # ── API helpers ───────────────────────────────────────────────

    async def api_get(self, path: str) -> dict | list:
        if self.session is None:
            raise RuntimeError("HTTP session not initialized")
        async with self.session.get(f"{API_BASE}{path}") as res:
            res.raise_for_status()
            return await res.json()

    # ── Polling loop ──────────────────────────────────────────────

    @tasks.loop(seconds=POLL_SECONDS)
    async def poll_status(self):
        await self.wait_until_ready()
        if self.channel is None:
            self.channel = self.get_channel(CHANNEL_ID)
            if self.channel is None:
                return

        try:
            data = await self.api_get(f"/api/bot/poll?since={self.since}")
            self.since = data.get("serverTime") or self.since

            if not data.get("hasChanges"):
                return

            changes = data.get("changes", [])
            print(f"  ↳ {len(changes)} change(s) found — posting...")

            for change in changes:
                embed = self.build_change_embed(change)
                if embed:
                    try:
                        await self.channel.send(embed=embed)
                    except Exception as e:
                        print(f"  ✗ Failed to post change: {e}")

        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"Poll error: {e}")

    @poll_status.before_loop
    async def before_poll(self):
        await self.wait_until_ready()

    # ── Embed builders ────────────────────────────────────────────

    def build_change_embed(self, change: dict) -> discord.Embed | None:
        """Build a rich Discord embed from a poll change event."""
        t = change.get("type")

        # ── New incident ──────────────────────────────────────────
        if t == "incident_created":
            inc = change.get("incident", {})
            color = IMPACT_COLORS.get(inc.get("impact"), 0xEAB308)
            updates = inc.get("updates") or [{}]
            description = updates[0].get("message", "") if updates else ""
            status = str(inc.get("status", "")).replace("_", " ").title()
            impact = str(inc.get("impact", "minor")).title()
            services = ", ".join(inc.get("serviceNames") or []) or "None listed"

            embed = discord.Embed(
                title=f"🚨 New Incident: {inc.get('title', '')}",
                description=description or "*No details provided*",
                url=STATUS_PAGE_URL,
                color=color,
                timestamp=datetime.now(timezone.utc),
            )
            embed.add_field(name="Status", value=status, inline=True)
            embed.add_field(name="Impact", value=impact, inline=True)
            embed.add_field(name="Affected Services", value=services, inline=False)
            embed.set_footer(text="Melix Status · New Incident")
            return embed

        # ── Incident update ───────────────────────────────────────
        if t == "incident_update":
            inc = change.get("incident", {})
            status = str(change.get("status", "")).replace("_", " ").title()
            resolved = status.lower() in ("resolved", "completed")
            color = 0x22C55E if resolved else IMPACT_COLORS.get(change.get("impact"), 0xEAB308)
            title_emoji = "✅" if resolved else "📢"
            title = f"{title_emoji} {'Resolved' if resolved else 'Update'}: {change.get('title', '')}"

            embed = discord.Embed(
                title=title,
                description=change.get("message", ""),
                url=STATUS_PAGE_URL,
                color=color,
                timestamp=datetime.now(timezone.utc),
            )
            embed.add_field(name="Status", value=status, inline=True)
            if inc.get("impact"):
                embed.add_field(name="Impact", value=str(inc["impact"]).title(), inline=True)
            embed.set_footer(text="Melix Status · Incident Update")
            return embed

        # ── Service status change ─────────────────────────────────
        if t == "service_status":
            name = change.get("name", "")
            label = change.get("statusLabel") or change.get("status", "")
            color_hex = str(change.get("color", "#8A8D9B")).replace("#", "")
            try:
                color = int(color_hex, 16)
            except ValueError:
                color = 0x8A8D9B

            embed = discord.Embed(
                title=f"⚙️ {name} status changed",
                description=f"Now: **{label}**",
                url=STATUS_PAGE_URL,
                color=color,
                timestamp=datetime.now(timezone.utc),
            )
            embed.set_footer(text="Melix Status · Service Update")
            return embed

        return None

    def build_overall_embed(self, overall: dict, services: list, incidents: list) -> discord.Embed:
        """Build a rich status overview embed."""
        status = overall.get("status", "unknown")
        label = overall.get("label", "Unknown")
        color = STATUS_COLORS.get(status, 0x8B929E)

        active = (
            [i for i in incidents if i.get("status") not in ("resolved", "completed")]
            if isinstance(incidents, list) else []
        )

        embed = discord.Embed(
            title=label,
            url=STATUS_PAGE_URL,
            color=color,
            timestamp=datetime.now(timezone.utc),
        )

        embed.add_field(
            name="Services",
            value=f"{len(services)} monitored",
            inline=True,
        )
        embed.add_field(
            name="Active Incidents",
            value=str(len(active)),
            inline=True,
        )
        embed.add_field(
            name="Status Page",
            value=f"[{STATUS_PAGE_URL}]({STATUS_PAGE_URL})",
            inline=True,
        )

        if services:
            svc_lines = []
            for s in services[:15]:
                sname = s.get("name", "")
                sstatus = s.get("statusLabel") or s.get("status", "")
                emoji = "🟢" if s.get("status") == "operational" else "🟡" if s.get("status") == "degraded" else "🔴"
                svc_lines.append(f"{emoji} **{sname}** — {sstatus}")
            embed.add_field(
                name="Service Detail",
                value="\n".join(svc_lines) if svc_lines else "—",
                inline=False,
            )

        if active:
            inc_lines = []
            for i in active[:5]:
                inc_lines.append(f"• **{i.get('title', '')}** ({i.get('impact', '?')})")
            embed.add_field(
                name="Ongoing Incidents",
                value="\n".join(inc_lines) or "—",
                inline=False,
            )

        embed.set_footer(text="Melix Status")
        return embed

    # ── Commands ──────────────────────────────────────────────────

    @commands.command(name="status")
    async def status_cmd(self, ctx: commands.Context):
        """Show the current overall status and all services."""
        async with ctx.typing():
            try:
                overall = await self.api_get("/api/bot/overall")
                services = await self.api_get("/api/bot/services")
                incidents = await self.api_get("/api/bot/incidents?active=1")
                embed = self.build_overall_embed(overall, services, incidents)
                await ctx.send(embed=embed)
            except Exception as e:
                await ctx.send(f"❌ Failed to fetch status: {e}")

    @commands.command(name="services")
    async def services_cmd(self, ctx: commands.Context):
        """List all services with their current status."""
        async with ctx.typing():
            try:
                services = await self.api_get("/api/bot/services")
                if not services:
                    return await ctx.send("No services configured.")

                embed = discord.Embed(
                    title="Melix Services",
                    url=STATUS_PAGE_URL,
                    color=0x22C55E,
                    timestamp=datetime.now(timezone.utc),
                )

                for s in services[:25]:
                    sstatus = s.get("statusLabel") or s.get("status", "")
                    emoji = "🟢" if s.get("status") == "operational" else "🟡" if s.get("status") == "degraded" else "🔴" if s.get("status") == "outage" else "🔵"
                    value = sstatus
                    if s.get("description"):
                        value += f" · {s['description']}"
                    embed.add_field(
                        name=f"{emoji} {s.get('name', '')}",
                        value=value,
                        inline=False,
                    )

                embed.set_footer(text=f"Status Page: {STATUS_PAGE_URL}")
                await ctx.send(embed=embed)
            except Exception as e:
                await ctx.send(f"❌ Failed to fetch services: {e}")

    @commands.command(name="incidents")
    async def incidents_cmd(self, ctx: commands.Context):
        """Show recent incidents."""
        async with ctx.typing():
            try:
                incidents = await self.api_get("/api/bot/incidents?limit=10")
                active = [i for i in incidents if i.get("status") not in ("resolved", "completed")]
                past = [i for i in incidents if i.get("status") in ("resolved", "completed")]

                if not active and not past:
                    return await ctx.send("✅ No recent incidents.")

                if active:
                    embed = discord.Embed(
                        title="🚨 Active Incidents",
                        url=STATUS_PAGE_URL,
                        color=0xEF4444,
                        timestamp=datetime.now(timezone.utc),
                    )
                    for inc in active[:5]:
                        services = ", ".join(inc.get("serviceNames") or []) or "—"
                        status = str(inc.get("status", "")).replace("_", " ").title()
                        embed.add_field(
                            name=inc.get("title", ""),
                            value=f"**{status}** · Impact: {inc.get('impact', '?')}\nAffected: {services}",
                            inline=False,
                        )
                    embed.set_footer(text=f"Status Page: {STATUS_PAGE_URL}")
                    await ctx.send(embed=embed)

                if past:
                    embed2 = discord.Embed(
                        title="✅ Past Incidents (Resolved)",
                        url=STATUS_PAGE_URL,
                        color=0x22C55E,
                    )
                    for inc in past[:5]:
                        embed2.add_field(
                            name=inc.get("title", ""),
                            value=f"Resolved — Impact: {inc.get('impact', '?')}",
                            inline=False,
                        )
                    embed2.set_footer(text=f"Status Page: {STATUS_PAGE_URL}")
                    await ctx.send(embed=embed2)

            except Exception as e:
                await ctx.send(f"❌ Failed to fetch incidents: {e}")

    @commands.command(name="statuspage", aliases=["page", "link"])
    async def statuspage_cmd(self, ctx: commands.Context):
        """Post the status page link."""
        embed = discord.Embed(
            title="Melix Status Page",
            description=f"View real-time service status and incident history at:\n{STATUS_PAGE_URL}",
            url=STATUS_PAGE_URL,
            color=0xF72466,
        )
        embed.set_thumbnail(url="https://staaj2c-del.github.io/melixstatus/favicon.ico")
        embed.set_footer(text="Melix Status")
        await ctx.send(embed=embed)

    @commands.command(name="poll", aliases=["check"])
    @commands.has_permissions(manage_messages=True)
    async def poll_cmd(self, ctx: commands.Context):
        """Manually trigger a poll for status changes."""
        async with ctx.typing():
            try:
                data = await self.api_get(f"/api/bot/poll?since={self.since}")
                self.since = data.get("serverTime") or self.since

                if not data.get("hasChanges"):
                    return await ctx.send("✅ No changes since last poll.")

                changes = data.get("changes", [])
                await ctx.send(f"📢 **{len(changes)} change(s)** found since last poll:")
                for change in changes[:5]:
                    embed = self.build_change_embed(change)
                    if embed:
                        await ctx.send(embed=embed)
                    else:
                        await ctx.send(f"• `{change.get('type')}` — {change.get('at', '?')}")
            except Exception as e:
                await ctx.send(f"❌ Poll failed: {e}")

    @commands.command(name="botinfo")
    async def botinfo_cmd(self, ctx: commands.Context):
        """Show bot information and API status."""
        try:
            overall = await self.api_get("/api/bot/overall")
            api_ok = True
        except Exception:
            overall = {}
            api_ok = False

        embed = discord.Embed(
            title="Melix Status Bot",
            color=0xF72466 if api_ok else 0xEF4444,
            timestamp=datetime.now(timezone.utc),
        )

        embed.add_field(name="Bot", value=f"<@{self.user.id}> (`{self.user}`)", inline=False)
        embed.add_field(name="API", value="✅ Connected" if api_ok else "❌ Disconnected", inline=True)
        embed.add_field(name="Poll Interval", value=f"{POLL_SECONDS}s", inline=True)
        embed.add_field(name="Status Channel", value=f"<#{CHANNEL_ID}>", inline=True)
        embed.add_field(name="Status Page", value=STATUS_PAGE_URL, inline=False)
        embed.add_field(
            name="Commands",
            value="`!status` `!services` `!incidents` `!statuspage` `!poll` `!botinfo`",
            inline=False,
        )
        embed.set_footer(text="Melix Status · v1.0")
        await ctx.send(embed=embed)

    # ── Error handler ─────────────────────────────────────────────

    async def on_command_error(self, ctx: commands.Context, error):
        if isinstance(error, commands.MissingPermissions):
            await ctx.send("❌ You don't have permission to use this command.")
        elif isinstance(error, commands.CommandNotFound):
            pass
        else:
            print(f"Command error [{ctx.command}]: {error}")

    async def close(self):
        if self.poll_status.is_running():
            self.poll_status.cancel()
        if self.session:
            await self.session.close()
        await super().close()


# ── Entry point ──────────────────────────────────────────────────

def main():
    if not TOKEN:
        raise SystemExit(
            "DISCORD_TOKEN not set. Create a .env file or set the environment variable.\n"
            "Example: DISCORD_TOKEN=your_bot_token_here"
        )
    if not API_KEY:
        raise SystemExit(
            "MELIX_API_KEY not set. Get it from the admin panel → Bot & Discord → Generate key.\n"
            "https://staaj2c-del.github.io/melixstatus/admin/"
        )
    if not CHANNEL_ID:
        raise SystemExit(
            "STATUS_CHANNEL_ID not set. Set it to the Discord channel ID where updates should post."
        )

    print(f"  ◈  Melix Status Bot  ◈")
    print(f"  API:   {API_BASE}")
    print(f"  Chan:  {CHANNEL_ID}")
    print(f"  Page:  {STATUS_PAGE_URL}")
    print(f"  Poll:  {POLL_SECONDS}s")
    print()

    bot = MelixStatusBot()
    bot.run(TOKEN)


if __name__ == "__main__":
    main()


