import * as Cloudflare from "@alchemy.run/cloudflare";

// Current originals, read only by their owner for restyling.
export const ArtworkSources = Cloudflare.R2.Bucket("ArtworkSources");

// Immutable published variants under opaque keys. The Worker serves them at
// /artwork/*; the CORS rule covers a public asset domain attached later.
// Objects are never deleted, so earlier exports keep loading.
export const PublishedArtwork = Cloudflare.R2.Bucket("PublishedArtwork", {
  cors: [{ allowedMethods: ["GET", "HEAD"], allowedOrigins: ["*"], maxAgeSeconds: 86400 }],
});
