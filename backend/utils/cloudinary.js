import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { Readable } from "stream";

let configured = false;
const ensureConfig = () => {
  if (!configured) {
    const url = process.env.CLOUDINARY_URL;
    if (url && url.startsWith("cloudinary://")) {
      const match = url.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
      if (match) {
        cloudinary.config({
          api_key: match[1],
          api_secret: match[2],
          cloud_name: match[3],
        });
      }
    } else {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    }
    configured = true;
  }
};

// Use memory storage, upload to Cloudinary manually
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"));
  },
});

// Upload buffer to Cloudinary
export const uploadToCloudinary = (buffer, options = {}) => {
  ensureConfig();
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: "job-applications/resumes",
      resource_type: "auto",
      type: "upload",
      ...options,
    };

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });

    Readable.from(buffer).pipe(stream);
  });
};

export const deleteFromCloudinary = async (publicId) => {
  ensureConfig();
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
    return result;
  } catch (err) {
    console.error("Cloudinary delete error:", err);
    throw err;
  }
};

export const getCloudinaryUrl = (publicId) => {
  ensureConfig();
  return cloudinary.url(publicId, { resource_type: "image", secure: true });
};

export default cloudinary;