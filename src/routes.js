'use strict';

const express = require('express');
const realmService = require('./realmService');
const exportService = require('./exportService');
const importService = require('./importService');

const router = express.Router();

function handle(fn) {
  return async (req, res) => {
    try {
      const data = await fn(req);
      res.json({ ok: true, data });
    } catch (err) {
      res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
  };
}

router.post('/open', handle(async (req) => {
  const { filePath, encryptionKeyHex } = req.body || {};
  return realmService.openRealm(filePath, encryptionKeyHex);
}));

router.post('/close', handle(async () => {
  realmService.closeRealm();
  return {};
}));

router.get('/schema', handle(async () => ({ schema: realmService.getSchema() })));

router.get('/objects/:className', handle(async (req) => {
  const filter = req.query.filter || '';
  const offsetRaw = parseInt(req.query.offset, 10);
  const offset = Number.isNaN(offsetRaw) ? 0 : offsetRaw;
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isNaN(limitRaw) ? undefined : limitRaw;
  return realmService.listObjects(req.params.className, filter, offset, limit);
}));

router.get('/objects/:className/count', handle(async (req) => {
  return realmService.countObjects(req.params.className);
}));

router.post('/objects/:className/export', handle(async (req) => {
  const { filter, format } = req.body || {};
  return exportService.exportObjects(req.params.className, filter || '', format);
}));

// Dispatch theo format giống cách exportService.js tự chọn FORMAT_HANDLERS
// bên trong nó - ở đây đặt tại routes.js vì importCsv/importMarkdown là 2
// hàm export riêng (đã có test gọi thẳng), không có 1 hàm "importData"
// chung nào để tự dispatch như exportObjects().
const IMPORT_FORMAT_HANDLERS = {
  csv: importService.importCsv,
  markdown: importService.importMarkdown,
};

router.post('/objects/:className/import', handle(async (req) => {
  const { content, mode, format } = req.body || {};
  const importFn = IMPORT_FORMAT_HANDLERS[format];
  if (!importFn) {
    const err = new Error(`Format "${format}" không được hỗ trợ. Chỉ hỗ trợ: csv, markdown.`);
    err.statusCode = 400;
    throw err;
  }
  return importFn(req.params.className, content, mode);
}));

router.post('/import/folder/scan', handle(async (req) => {
  const { folderPath } = req.body || {};
  return importService.scanImportFolder(folderPath);
}));

router.post('/import/folder/execute', handle(async (req) => {
  const { resolvedPath, matched, mode } = req.body || {};
  return importService.executeImportFolder(resolvedPath, matched, mode);
}));

router.post('/export/schema', handle(async (req) => {
  const { folder, format } = req.body || {};
  return exportService.exportSchema(folder, format);
}));

router.post('/objects/:className', handle(async (req) => {
  return realmService.createObject(req.params.className, req.body || {});
}));

router.put('/objects/:className/:ref', handle(async (req) => {
  const filter = req.query.filter || '';
  return realmService.updateObject(req.params.className, req.params.ref, req.body || {}, filter);
}));

router.delete('/objects/:className/:ref', handle(async (req) => {
  const filter = req.query.filter || '';
  realmService.deleteObject(req.params.className, req.params.ref, filter);
  return {};
}));

module.exports = router;
