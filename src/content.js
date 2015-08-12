// Store, retrieve, and delete metadata envelopes.

var async = require('async');
var _ = require('lodash');
var restify = require('restify');
var config = require('./config');
var storage = require('./storage');
var log = require('./logging').getLogger();
var assets = require('./assets');

/**
 * @description Download the raw metadata envelope from Cloud Files.
 */
function downloadContent(contentID, callback) {
  storage.getContent(contentID, function(err, content) {
    if (err) {
      if (err.statusCode === 404) {
        return callback(new restify.NotFoundError("No content for ID [" + contentID + "]"));
      }

      log.warn({
        action: 'contentretrieve',
        contentID: contentID,
        cloudFilesCode: err.statusCode,
        cloudFilesResponse: err.responseBody,
        message: "Cloud Files error."
      });

      return callback(new restify.InternalServerError("Error communicating with an upstream service."));
    }

    var envelope = JSON.parse(complete);

    callback(null, {
      envelope: envelope
    });
  });
}

/**
 * @description Inject asset variables included from the /assets endpoint into
 *   an outgoing metadata envelope.
 */
function injectAssetVars(doc, callback) {
  assets.enumerateNamed(function(err, assets) {
    doc.assets = assets;
    callback(null, doc);
  });
}

/**
 * @description Store an incoming metadata envelope within Cloud Files.
 */
function storeEnvelope(doc, callback) {
  storage.storeContent(doc.contentID, JSON.stringify(doc.envelope), function(err) {
    if (err) return callback(err);

    callback(null, doc);
  });
}

/**
 * @description Retrieve content from the store by content ID.
 */
exports.retrieve = function(req, res, next) {
  log.debug({
    action: "contentretrieve",
    contentID: req.params.id,
    message: "Content ID request received."
  });

  var reqStart = Date.now();

  async.waterfall([
    async.apply(downloadContent, req.params.id),
    injectAssetVars
  ], function(err, doc) {
    if (err) {
      log.error({
        action: "contentretrieve",
        statusCode: err.statusCode || 500,
        contentID: req.params.id,
        error: err.message,
        message: "Unable to retrieve content."
      });

      return next(err);
    }

    res.json(doc);

    log.info({
      action: "contentretrieve",
      statusCode: 200,
      contentID: req.params.id,
      totalReqDuration: Date.now() - reqStart,
      message: "Content request successful."
    });

    next();
  });
};

/**
 * @description Store new content into the content service.
 */
exports.store = function(req, res, next) {
  log.debug({
    action: "contentstore",
    apikeyName: req.apikeyName,
    contentID: req.params.id,
    message: "Content storage request received."
  });

  var reqStart = Date.now();

  var doc = {
    contentID: req.params.id,
    envelope: req.body
  };

  storeEnvelope(doc, function(err, doc) {
    if (err) {
      log.error({
        action: "contentstore",
        statusCode: err.statusCode || 500,
        apikeyName: req.apikeyName,
        contentID: req.params.id,
        error: err.message,
        totalReqDuration: Date.now() - reqStart,
        message: "Unable to store content."
      });

      return next(err);
    }

    res.send(204);

    log.info({
      action: "contentstore",
      statusCode: 204,
      apikeyName: req.apikeyName,
      contentID: req.params.id,
      totalReqDuration: Date.now() - reqStart,
      message: "Content storage successful."
    });

    next();
  });
};

/**
 * @description Delete a piece of previously stored content by content ID.
 */
exports.delete = function(req, res, next) {
  log.debug({
    action: "contentdelete",
    apikeyName: req.apikeyName,
    contentID: req.params.id,
    message: "Content deletion request received."
  });

  var reqStart = Date.now();

  storage.deleteContent(req.params.id, function(err) {
    if (err) {
      log.error({
        action: "contentdelete",
        statusCode: err.statusCode || 500,
        apikeyName: req.apikeyName,
        contentID: req.params.id,
        totalReqDuration: Date.now() - reqStart,
        message: "Unable to delete content."
      });

      return next(err);
    }

    res.send(204);

    log.info({
      action: "contentdelete",
      statusCode: 204,
      apikeyName: req.apikeyName,
      contentID: req.params.id,
      totalReqDuration: Date.now() - reqStart,
      message: "Content deletion successful."
    });

    next();
  });
};
