import dns from "node:dns/promises";
import https from "node:https";
import http from "node:http";
import ipaddr from "ipaddr.js";

export function publicAddress(address) {
  const parsed = ipaddr.process(address);
  return parsed.range() === "unicast";
}
export async function request(
  url,
  headers = {},
  method = "GET",
  redirects = 0
) {
  const target = new URL(url);
  if (
    !["https:", "http:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.hash ||
    (target.port &&
      target.port !== (target.protocol === "https:" ? "443" : "80"))
  )
    throw new Error("Unsupported source URL");
  const addresses = await dns.lookup(target.hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !publicAddress(address))
  )
    throw new Error("Source must resolve to public addresses");
  const address = addresses[0];
  const response = await new Promise((resolve, reject) => {
    const req = (target.protocol === "https:" ? https : http).request(
      target,
      {
        method,
        headers: { ...headers, "Accept-Encoding": "identity" },
        lookup: (_hostname, options, callback) =>
          options?.all
            ? callback(null, [address])
            : callback(null, address.address, address.family)
      },
      resolve
    );
    req.setTimeout(20000, () => req.destroy(new Error("Source timeout")));
    req.on("error", reject);
    req.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
    response.destroy();
    const next = new URL(response.headers.location, target);
    if (
      redirects >= 5 ||
      (target.protocol === "https:" && next.protocol !== "https:")
    )
      throw new Error("Invalid source redirect");
    return request(next.href, headers, method, redirects + 1);
  }
  const status = response.statusCode;
  const limit = 8 * 1024 * 1024;
  if (
    !["", "identity"].includes(response.headers["content-encoding"] || "") ||
    (method !== "HEAD" && Number(response.headers["content-length"]) > limit)
  ) {
    response.destroy();
    throw new Error("Source response exceeds limits");
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of response) {
    size += chunk.length;
    if (size > limit) {
      response.destroy();
      throw new Error("Source response exceeds limits");
    }
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  return {
    status,
    ok: status >= 200 && status < 300,
    getHeader: (name) => response.headers[name.toLowerCase()] ?? null,
    getData: async () =>
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  };
}
