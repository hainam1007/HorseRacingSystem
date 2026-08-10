const { v2: cloudinary } = require('cloudinary');

function isConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function configure() {
  if (!isConfigured()) {
    return false;
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  return true;
}

function looksUploadable(value) {
  return typeof value === 'string' && (value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://'));
}

async function uploadAsset(source, options) {
  if (!source) {
    return null;
  }

  if (!looksUploadable(source)) {
    return {
      secure_url: source,
      public_id: null,
      skipped: true,
      reason: 'Source is not a supported upload value'
    };
  }

  if (!configure()) {
    return {
      secure_url: source,
      public_id: null,
      skipped: true,
      reason: 'Cloudinary credentials are not configured'
    };
  }

  const result = await cloudinary.uploader.upload(source, {
    folder: options && options.folder ? options.folder : 'horse-racing',
    resource_type: options && options.resource_type ? options.resource_type : 'auto',
    overwrite: false
  });

  return {
    secure_url: result.secure_url,
    public_id: result.public_id,
    resource_type: result.resource_type,
    format: result.format,
    bytes: result.bytes,
    skipped: false
  };
}

async function uploadOptionalSource(primarySource, fallbackSource, options) {
  const source = primarySource || fallbackSource;

  if (!source) {
    return null;
  }

  return uploadAsset(source, options);
}

module.exports = {
  isConfigured,
  uploadAsset,
  uploadOptionalSource
};
