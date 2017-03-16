const debug = require('debug')('Net.Http.HttpServer');
const express = require('express');

const Errors = require('../../Errors.js');

class HttpServer {

    constructor(protocol) {
        this._protocol = protocol;
    }

    static _errorToStatus(err) {
        if (err === Errors.NOT_SUPPORTED) {
            return HttpServer.ErrorCodes.SERVICE_UNAVAILABLE;
        }
        return HttpServer.ErrorCodes.INTERNAL_SERVER_ERROR;
    }

    _onGetDevice(req, res) {
        res.sendStatus(HttpServer.ErrorCodes.NOT_IMPLEMENTED);
    }

    _onGetUser(req, res) {
        res.sendStatus(HttpServer.ErrorCodes.NOT_IMPLEMENTED);
    }

    _onGetStatus(req, res) {
        this._protocol.status().then((status) => {
            res.json(status);
        })
        .catch(err => res.sendStatus(HttpServer._errorToStatus(err)));
    }

    _onPostAnnounce(req, res) {
        res.sendStatus(HttpServer.ErrorCodes.NOT_IMPLEMENTED);
    }

    _onGetCapsules(req, res) {
        this._protocol.capsules.listAll().then((capsules) => {
            const result = {
                count:    capsules.length,
                capsules: capsules,
            };
            res.json(result);
        })
        .catch(err => res.sendStatus(HttpServer._errorToStatus(err)));
    }

    _onGetCapsuleStatus(req, res) {
        res.sendStatus(HttpServer.ErrorCodes.NOT_IMPLEMENTED);
    }

    _onPostCapsuleRefresh(req, res) {
        res.sendStatus(HttpServer.ErrorCodes.NOT_IMPLEMENTED);
    }

    _onPostCapsuleSubscribe(req, res) {
        res.sendStatus(HttpServer.ErrorCodes.NOT_IMPLEMENTED);
    }

    _onPostCapsuleUnsubscribe(req, res) {
        res.sendStatus(HttpServer.ErrorCodes.NOT_IMPLEMENTED);
    }

    _onGetCapsuleEntry(req, res) {
        res.sendStatus(HttpServer.ErrorCodes.NOT_IMPLEMENTED);
    }

    start(port) {
        const app = express();

        app.get('/v1/device', this._onGetDevice.bind(this));
        app.get('/v1/user', this._onGetUser.bind(this));
        app.get('/v1/status', this._onGetStatus.bind(this));
        app.post('/v1/notifications', this._onPostAnnounce.bind(this));
        // app.get('/v1/subscriptions', this._onGetSubscriptions.bind(this));
        // app.put('/v1/subscriptions', this._onGetSubscriptions.bind(this));
        // app.del('/v1/subscriptions', this._onGetSubscriptions.bind(this));
        app.get('/v1/capsules', this._onGetCapsules.bind(this));
        app.get('/v1/capsules/:capsule/status', this._onGetCapsuleStatus.bind(this));
        app.post('/v1/capsules/:capsule/refresh', this._onPostCapsuleRefresh.bind(this));
        app.post('/v1/capsules/:capsule/subscribe', this._onPostCapsuleSubscribe.bind(this));
        app.post('/v1/capsules/:capsule/unsubscribe', this._onPostCapsuleUnsubscribe.bind(this));
        app.get('/v1/capsules/:capsule/data/', this._onGetCapsuleEntry.bind(this));

        app.param('capsule', (req, res, next, id) => {
            this._protocol.capsules.get(id).then((capsule) => {
                req.capsule = capsule;
            })
            .then(next)
            .catch(next);
        });

        return new Promise((resolve) => {
            debug(`Starting server on port ${port}...`);
            app.listen(port, () => {
                debug(`Succesfully started server on port ${port}.`);
                resolve();
            });
        });
    }

}

HttpServer.ErrorCodes = {
    FORBIDDEN:             403,
    NOT_FOUND:             404,
    INTERNAL_SERVER_ERROR: 500,
    NOT_IMPLEMENTED:       501,
    SERVICE_UNAVAILABLE:   503,
};

module.exports = HttpServer;
