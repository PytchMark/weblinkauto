"use strict";

const crypto = require("crypto");

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const CLOUDINARY_FOLDER_ROOT = process.env.CLOUDINARY_FOLDER_ROOT || "carsales-platform";

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  // We allow running without Cloudinary in early dev,
  // but uploads won't work.
  console.warn("⚠️ Cloudinary env vars missing. Upload helpers will be unavailable.");
}

function buildCloudinaryFolder({ dealerId, vehicleId, type }) {
  const safeDealer = String(dealerId || "").trim();
  const safeVeh = String(vehicleId || "").trim();
  const safeType = type === "videos" ? "videos" : "images";
  return `${CLOUDINARY_FOLDER_ROOT}/${safeDealer}/${safeVeh}/${safeType}`;
}

/**
 * Cloudinary signed upload (server creates signature + returns params to frontend)
 * Frontend uploads directly to Cloudinary using these params WITHOUT knowing API secret.
 *
 * NOTE: This is the recommended approach vs putting Cloudinary secrets in browser.
 */
function getSignedUploadParams({ folder, publicId, resourceType = "image" }) {
  if (!CLOUDINARY_API_SECRET || !CLOUDINARY_API_KEY || !CLOUDINARY_CLOUD_NAME) {
    throw new Error("Cloudinary not configured");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = [];

  if (folder) paramsToSign.push(`folder=${folder}`);
  if (publicId) paramsToSign.push(`public_id=${publicId}`);
  paramsToSign.push(`timestamp=${timestamp}`);

  // Signature base string must be sorted and joined with &
  const baseString = paramsToSign.sort().join("&");

  const signature = crypto
    .createHash("sha1")
    .update(baseString + CLOUDINARY_API_SECRET)
    .digest("hex");

  return {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder,
    publicId,
    resourceType,
  };
}

/**
 * If you later want server-to-server uploads instead (not required now),
 * we can add a function that POSTs the file buffer to Cloudinary.
 */

module.exports = {
  buildCloudinaryFolder,
  getSignedUploadParams,
};
