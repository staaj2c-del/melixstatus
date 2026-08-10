#!/usr/bin/env python3
"""
Melix Status → Discord bot poller (discord.py)

Setup:
  1. Admin panel → Bot & Discord → Generate API key
  2. (Optional) Enable Discord webhook for instant posts from the API itself
  3. pip install discord.py aiohttp
  4. export MELIX_API_KEY=mlx_... DISCORD_TOKEN=... STATUS_CHANNEL_ID=...
  5. python bot-example.py

This bot polls /api/bot/poll and posts embeds when incidents/updates change.
You can also use webhook-only mode (no bot token) via the admin Discord settings.
"""

import os
import asyncio
from datetime import datetime, timezone

import aiohttp
import discord
from discord.ext import tasks, commands

API_BASE = os.getenv("MELIX_API_BASE", "https://melix-status.vercel.app")
API_KEY = os.getenv("MELIX_API_KEY", "")
TOKEN = os.getenv("DISCORD_TOKEN", "")
CHANNEL_ID = int(os.getenv("STATUS_CHANNEL_ID", "0"))
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "30"))

IMPACT_COLOR = {
    "none": 0x8B929E,
    "minor": 0xEAB308,
    "major": 0xF97316,
    "critical": 0xEF4444,
    "maintenance": 0x2DD4E8,
}


class MelixStatusBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        super().__init__(command_prefix="!", intents=intents)
        self.session: aiohttp.ClientSession | None = None
        self.since = datetime.now(timezone.utc).isoformat()

    async def setup_hook(self):
        self.session = aiohttp.ClientSession(
            headers={"X-API-Key": API_KEY, "Accept": "application/json"}
        )
        self.poll_status.start()

    async def close(self):
        if self.session:
            await self.session.close()
        await super().close()

    async def api_get(self, path: str):
        assert self.session
        async with self.session.get(f"{API_BASE}{path}") as res:
            res.raise_for_status()
            return await res.json()

    @tasks.loop(seconds=POLL_SECONDS)
    async def poll_status(self):
        await self.wait_until_ready()
        channel = self.get_channel(CHANNEL_ID)
        if channel is None:
            return
        try:
            data = await self.api_get(f"/api/bot/poll?since={self.since}")
            self.since = data.get("serverTime") or self.since
            if not data.get("hasChanges"):
                return
            for change in data.get("changes", []):
                embed = self.build_embed(change)
                if embed:
                    await channel.send(embed=embed)
        except Exception as e:
            print("poll error:", e)

    def build_embed(self, change: dict) -> discord.Embed | None:
        t = change.get("type")
        if t == "incident_created":
            inc = change["incident"]
            color = IMPACT_COLOR.get(inc.get("impact"), 0xEAB308)
            e = discord.Embed(
                title=f"🚨 New Incident: {inc.get('title')}",
                description=(inc.get("updates") or [{}])[0].get("message", ""),
                color=color,
                timestamp=datetime.now(timezone.utc),
            )
            e.add_field(name="Status", value=str(inc.get("status", "")).replace("_", " ").title())
            e.add_field(name="Impact", value=str(inc.get("impact", "")).title())
            services = ", ".join(inc.get("serviceNames") or []) or "—"
            e.add_field(name="Affected", value=services, inline=False)
            e.set_footer(text="Melix Status")
            return e

        if t == "incident_update":
            resolved = change.get("status") in ("resolved", "completed")
            color = 0x22C55E if resolved else IMPACT_COLOR.get(change.get("impact"), 0xEAB308)
            title = f"{'✅ Resolved' if resolved else '📢 Update'}: {change.get('title')}"
            e = discord.Embed(
                title=title,
                description=change.get("message", ""),
                color=color,
                timestamp=datetime.now(timezone.utc),
            )
            e.add_field(name="Status", value=str(change.get("status", "")).replace("_", " ").title())
            e.set_footer(text="Melix Status")
            return e

        if t == "service_status":
            e = discord.Embed(
                title=f"⚙️ {change.get('name')} status changed",
                description=f"**{change.get('statusLabel') or change.get('status')}**",
                color=int(str(change.get("color", "#8A8D9B")).replace("#", "") or "8A8D9B", 16),
                timestamp=datetime.now(timezone.utc),
            )
            e.set_footer(text="Melix Status")
            return e

        return None

    @commands.command(name="status")
    async def status_cmd(self, ctx: commands.Context):
        """Post current overall status + services."""
        snap = await self.api_get("/api/bot/snapshot")
        overall = snap["overall"]
        color = int(str(overall.get("color", "#22C55E")).replace("#", ""), 16)
        e = discord.Embed(
            title=overall.get("label", "Status"),
            color=color,
            url=snap.get("statusPageUrl"),
            timestamp=datetime.now(timezone.utc),
        )
        for s in snap.get("services", []):
            e.add_field(
                name=s["name"],
                value=f"{s.get('status', '')} · {s.get('uptime', '?')}% uptime",
                inline=True,
            )
        active = snap.get("incidents", {}).get("active") or []
        if active:
            e.add_field(
                name="Active incidents",
                value="\n".join(f"• {i['title']}" for i in active[:5]),
                inline=False,
            )
        e.set_footer(text="Melix Status")
        await ctx.send(embed=e)


def main():
    if not API_KEY or not TOKEN or not CHANNEL_ID:
        raise SystemExit(
            "Set MELIX_API_KEY, DISCORD_TOKEN, and STATUS_CHANNEL_ID env vars"
        )
    bot = MelixStatusBot()
    bot.run(TOKEN)


if __name__ == "__main__":
    main()

