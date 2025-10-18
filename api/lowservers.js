// api/lowservers.js
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests are allowed." });
  }

  try {
    const { bot_token, user_count, custom_message, whitelist = [] } = req.body;

    if (!bot_token || typeof user_count !== "number" || !custom_message) {
      return res.status(400).json({
        error: "Missing bot_token, user_count (number) or custom_message.",
      });
    }

    // Botun tüm sunucularını çek
    const guildsResp = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bot ${bot_token}` },
    });

    if (!guildsResp.ok) {
      const text = await guildsResp.text();
      return res.status(guildsResp.status).json({
        error: "Discord API error fetching guilds.",
        details: text,
      });
    }

    const guilds = await guildsResp.json();
    const toLeave = [];
    const leftGuilds = [];
    const skippedGuilds = [];

    // Her sunucu için üye sayısını kontrol et
    for (const g of guilds) {
      try {
        const infoResp = await fetch(
          `https://discord.com/api/v10/guilds/${g.id}?with_counts=true`,
          { headers: { Authorization: `Bot ${bot_token}` } }
        );

        if (!infoResp.ok) continue;
        const info = await infoResp.json();
        const memberCount = info.approximate_member_count ?? info.member_count ?? 0;

        // Whitelist'te varsa atla
        if (whitelist.includes(g.id)) {
          skippedGuilds.push(`${g.name} (${g.id})`);
          continue;
        }

        // Belirlenen limitin altındaysa çıkılacak
        if (memberCount < user_count) {
          toLeave.push({ id: g.id, name: g.name, memberCount });
        }
      } catch (err) {
        console.error(`Error fetching ${g.id}:`, err);
      }
    }

    // Çıkış işlemleri
    for (const guild of toLeave) {
      try {
        const channelsResp = await fetch(
          `https://discord.com/api/v10/guilds/${guild.id}/channels`,
          { headers: { Authorization: `Bot ${bot_token}` } }
        );

        if (channelsResp.ok) {
          const channels = await channelsResp.json();
          const textChannel = channels.find((c) => c.type === 0);

          if (textChannel) {
            await fetch(
              `https://discord.com/api/v10/channels/${textChannel.id}/messages`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bot ${bot_token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ content: custom_message }),
              }
            );
          }
        }

        await delay(1000); // Rate limit önlemi

        await fetch(
          `https://discord.com/api/v10/users/@me/guilds/${guild.id}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bot ${bot_token}` },
          }
        );

        leftGuilds.push(
          `${leftGuilds.length + 1}. ${guild.name} (${guild.id}) - ${guild.memberCount ?? "?"} üyeli`
        );

        await delay(1000);
      } catch (err) {
        console.error(`Failed on guild ${guild.id}:`, err);
      }
    }

    return res.status(200).json({
      message: `Bot ${leftGuilds.length} sunucudan çıktı. ${skippedGuilds.length} sunucu whitelist'te.`,
      count: leftGuilds.length,
      left_servers: leftGuilds,
      skipped_servers: skippedGuilds,
    });
  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
}
