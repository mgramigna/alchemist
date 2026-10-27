import * as Cloudflare from "@alchemy.run/cloudflare";
import * as RemovalPolicy from "alchemy/RemovalPolicy";

// Current originals, read only by their owner for restyling.
export const ArtworkSources = Cloudflare.R2.Bucket("ArtworkSources").pipe(RemovalPolicy.retain());

// Immutable published variants under opaque keys. The Worker serves them at
// /artwork/* on the app and asset domains. Neither bucket exposes a public R2 endpoint.
// Objects are never deleted, so earlier exports keep loading.
export const PublishedArtwork = Cloudflare.R2.Bucket("PublishedArtwork", {
  cors: [{ allowedMethods: ["GET", "HEAD"], allowedOrigins: ["*"], maxAgeSeconds: 86400 }],
}).pipe(RemovalPolicy.retain());
