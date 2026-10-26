const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";

// A lowercase ULID: 48-bit millisecond time then 80 random bits, Crockford base32.
export const ulid = (now: number) => {
  let time = "";

  for (let rest = now, i = 0; i < 10; i++, rest = Math.floor(rest / 32))
    time = CROCKFORD[rest % 32] + time;

  const random = Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (byte) => CROCKFORD[byte % 32],
  ).join("");

  return time + random;
};
