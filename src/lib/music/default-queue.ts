import type { Track } from "./types";

/** CC0 public-domain jazz from HoliznaCC0; playable without connecting an account. */
export const DEFAULT_QUEUE: Track[] = [
  {
    provider: "youtube",
    id: "jJ-q_tdDNsk",
    uri: "youtube:video:jJ-q_tdDNsk",
    title: "Jazz #1",
    artists: ["HoliznaCC0"],
    album: "Public domain · CC0 1.0",
    artworkUrl: "https://i.ytimg.com/vi/jJ-q_tdDNsk/hqdefault.jpg",
    externalUrl: "https://www.youtube.com/watch?v=jJ-q_tdDNsk",
  },
  {
    provider: "youtube",
    id: "R6R-hzNAcpI",
    uri: "youtube:video:R6R-hzNAcpI",
    title: "Jazz #2",
    artists: ["HoliznaCC0"],
    album: "Public domain · CC0 1.0",
    artworkUrl: "https://i.ytimg.com/vi/R6R-hzNAcpI/hqdefault.jpg",
    externalUrl: "https://www.youtube.com/watch?v=R6R-hzNAcpI",
  },
  {
    provider: "youtube",
    id: "ZjfSrJEbyjk",
    uri: "youtube:video:ZjfSrJEbyjk",
    title: "Busted Jazz",
    artists: ["HoliznaCC0"],
    album: "Public domain · CC0 1.0",
    artworkUrl: "https://i.ytimg.com/vi/ZjfSrJEbyjk/hqdefault.jpg",
    durationMs: 149_000,
    externalUrl: "https://www.youtube.com/watch?v=ZjfSrJEbyjk",
  },
];
