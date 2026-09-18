const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads', 'private'));
fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedExtensions = new Set(['.pdf', '.txt', '.csv', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg']);
const allowedMimeTypes = new Set([
  'application/pdf', 'text/plain', 'text/csv', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png', 'image/jpeg',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(file.mimetype)) {
      return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    }
    callback(null, true);
  },
});

module.exports = { upload, uploadDirectory };
