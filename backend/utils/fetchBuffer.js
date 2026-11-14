import https from "https";
import http from "http";

/** Download a remote file (e.g. a Cloudinary resume) into memory. */
export const fetchBuffer = (url) =>
  new Promise((resolve, reject) => {
    if (!url) return reject(new Error("Missing file URL"));
    const client = String(url).startsWith("http://") ? http : https;

    const request = client.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        response.resume();
        return reject(new Error(`Failed to download file (HTTP ${response.statusCode})`));
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });

    request.on("error", reject);
    request.setTimeout(30000, () => {
      request.destroy(new Error("File download timed out"));
    });
  });
