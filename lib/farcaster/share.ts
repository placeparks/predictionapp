export type SharePayload = {
  text: string;
  embeds?: string[];
  channelKey?: string;
};

export function buildWarpcastComposeUrl({ text, embeds = [], channelKey }: SharePayload) {
  const url = new URL("https://warpcast.com/~/compose");
  if (text) url.searchParams.set("text", text);

  for (const embed of embeds.slice(0, 2)) {
    if (embed) url.searchParams.append("embeds[]", embed);
  }

  if (channelKey) url.searchParams.set("channelKey", channelKey);
  return url.toString();
}

export function openWarpcastCompose(payload: SharePayload) {
  const href = buildWarpcastComposeUrl(payload);
  if (typeof window !== "undefined") window.open(href, "_blank", "noopener,noreferrer");
  return href;
}
