var path = require('path'),
    util = require('util'),
    growl = require('growl'),
    async = require('async'),
    isBinaryFile = require('isbinaryfile'),
    BizwebApi = require('my-bizweb-api');

module.exports = function(grunt) {
	var bizweb = {};
    bizweb._api = false;
    bizweb._basePath = false;

    /*
     * Get the Bizweb API instance.
     *
     * @return {BizwebApi}
     */
    bizweb._getApi = function() {
        if (!bizweb._api) {
            var config = grunt.config('bizweb');
            var opts = {
                auth: config.options.api_key + ':' + config.options.password,
                host: config.options.url,
                port: config.options.port,
                timeout: config.options.timeout
            };

            bizweb._api = new BizwebApi(opts);
        }

        return bizweb._api;
    };

    /*
     * Get the base path.
     *
     * @return {string}
     */
    bizweb._getBasePath = function() {
        if (!bizweb._basePath) {
            var config = grunt.config('bizweb'),
                base = ('base' in config.options) ? config.options.base : false;

            bizweb._basePath = (base.length > 0) ? path.resolve(base) : process.cwd();
        }

        return bizweb._basePath;
    };

    /*
     * Get the Theme ID.
     *
     * @return {integer}
     */
    bizweb._getThemeId = function() {
        var config = grunt.config('bizweb');
        return ('theme' in config.options) ? config.options.theme : false;
    };

    bizweb._getSyncThemeId = function() {
        var config = grunt.config('bizweb');
        return ('sync' in config.options) ? config.options.sync : false;
    };

    /*
     * Determine if path is within our base path.
     *
     * @return {Boolean}
     */
    bizweb._isPathInBase = function(filepath) {
        var basePath = bizweb._getBasePath();

        try {
            return grunt.file.doesPathContain(basePath, path.resolve(filepath));
        } catch(e) {
            return false;
        }
    };

    /*
     * Determine if path is valid to use.
     *
     * @return {Boolean}
     */
    bizweb._isValidPath = function(filepath) {
        if (!bizweb._isPathInBase(filepath)) {
            bizweb.notify('File "' + filepath + '" not in base path');
            return false;
        } else if (!bizweb._isWhitelistedPath(filepath)) {
            var relative = bizweb._makePathRelative(filepath);
            bizweb.notify('File "' + relative + '" not allowed by Bizweb whitelist');
            return false;
        }

        return true;
    };

    /*
     * Determine if path is allowed by Bizweb.
     *
     * @return {Boolean}
     */
    bizweb._isWhitelistedPath = function(filepath) {
        filepath = bizweb._makePathRelative(filepath);

        return filepath.match(/^(assets|config|layout|snippets|templates|locales)\//i);
    };

    /*
     * Determine if path is being watched.
     *
     * @return {Boolean}
     */
    bizweb._isWatchedPath = function(filepath) {
        watchedFolders = grunt.config('watch').bizweb.files;

        return grunt.file.isMatch(watchedFolders,filepath);
    };

    /*
     * Convert a file path on the local file system to an asset path in bizweb
     * as you may run grunt at a higher directory locally.
     *
     * The original path to a file may be something like shop/assets/site.css
     * whereas we require assets/site.css in the API. To customize the base
     * set bizweb.options.base config option.
     *
     * @param {string}
     * @return {string}
     */
    bizweb._makeAssetKeyDownload = function(filepath) {
        return filepath;
    };

    bizweb._makeAssetKey = function(filepath) {
        filepath = bizweb._makePathRelative(filepath);

        return encodeURI(filepath);
    };

    /**
     * Make a path relative to base path.
     *
     * @param {string} filepath
     * @return {string}
     */
    bizweb._makePathRelative = function(filepath) {
        var basePath = bizweb._getBasePath();

        filepath = path.relative(basePath, filepath);

        return filepath.replace(/\\/g, '/');
    };

    /*
     * Save a Bizweb asset to disk.
     *
     * @param {string} key
     * @param {Object} obj
     * @param {Function} done
     */
    bizweb._saveAsset = function(key, obj, done) {
        var contents,
            basePath = bizweb._getBasePath(),
            destination = path.join(basePath, key);

        bizweb.notify('Downloading "' + key + '".');

        if (typeof obj.asset.value !== 'undefined') {
            contents = obj.asset.value;
        } else if (typeof obj.asset.attachment !== 'undefined') {
            contents = new Buffer(obj.asset.attachment, 'base64');
        } else {
            return done(new Error('Parsed object is not complete'));
        }

        if (grunt.option('no-write')) {
            console.log(util.inspect(obj));
        } else {
            grunt.file.write(destination, contents);
            bizweb.notify('File "' + key + '" saved to disk.');
        }

        done();
    };

    /*
     * Helper for reporting messages to the user.
     *
     * @param {string} msg
     */
    bizweb.notify = function(msg, err) {
        var config = grunt.config('bizweb');

        msg = decodeURI(msg);
        err = err || false;

        if (config.options.disable_growl_notifications !== false) {
            growl(msg, { title: 'Grunt Bizweb'});
        }

        if (!config.options.disable_grunt_log) {
            if (err) {
                grunt.log.error('[grunt-bizweb] - ' + msg);
            } else {
                grunt.log.ok('[grunt-bizweb] - ' + msg);
            }
        }
    };

    /*
     * Remove a given file path from Bizweb.
     *
     * File should be the relative path on the local filesystem.
     *
     * @param {string} filepath
     * @param {Function} done
     */
    bizweb.remove = function(filepath, done) {
        if (!bizweb._isValidPath(filepath)) {
            return done();
        }

        var api = bizweb._getApi(),
            themeId = bizweb._getThemeId(),
            key = bizweb._makeAssetKey(filepath);

        bizweb.notify('File "' + key + '" being removed.');

        function onDestroy(err) {
            if (!err) {
                bizweb.notify('File "' + key + '" removed.');
            }

            done(err);
        }

        if (themeId) {
            api.asset.destroy(themeId, key, onDestroy);
        } else {
            api.assetLegacy.destroy(key, onDestroy);
        }
    };

    /*
     * Upload a given file path to Bizweb
     *
     * Assets need to be in a suitable directory.
     *      - Liquid templates => "templates/"
     *      - Liquid layouts => "layout/"
     *      - Liquid snippets => "snippets/"
     *      - Theme settings => "config/"
     *      - General assets => "assets/"
     *      - Language files => "locales/"
     *
     * Some requests may fail if those folders are ignored
     * @param {string} filepath
     * @param {Function} done
     */
    bizweb.upload = function(filepath, done) {
        if (!bizweb._isValidPath(filepath)) {
            return done();
        }

        var api = bizweb._getApi(),
            themeId = bizweb._getThemeId(),
            key = bizweb._makeAssetKey(filepath),
            isBinary = isBinaryFile(filepath),
            props = {
                asset: {
                    key: key
                }
            },
            contents;

        contents = grunt.file.read(filepath, { encoding: isBinary ? null : 'utf8' });
        bizweb.notify('Uploading "'+ key +'"');

        if (isBinary) {
            props.asset.attachment = contents.toString('base64');
        } else {
            props.asset.value = contents.toString();
        }

        function onUpdate(err, resp) {
            if (err && err.type === 'BizwebInvalidRequestError') {
                bizweb.notify('Error uploading file ' + JSON.stringify(err.detail), true);
            } else if (!err) {
                bizweb.notify('File "' + key + '" uploaded.');
            }

            done(err);
        }

        if (themeId) {
            api.asset.update(themeId, props, onUpdate);
        } else {
            api.assetLegacy.update(props, onUpdate);
        }
    };

    /*
     * Deploy an entire theme to Bizweb.
     *
     * @param {Function} done
     */
    bizweb.deploy = function(done, options) {
        var c = grunt.config('bizweb');

        var basePath = bizweb._getBasePath();
        var filepaths = grunt.file.expand({ cwd: basePath }, [
            'assets/*.*',
            'config/*.*',
            'layout/*.*',
            'locales/*.*',
            'snippets/*.*',
            'templates/*.*',
            'templates/customers/*.*'
        ]);

        if (options.noJson) {
            var index = filepaths.indexOf('settings_data.json');
            filepaths.splice(index, 1);
        }

        async.eachSeries(filepaths, function(filepath, next) {
            bizweb.upload(path.join(basePath, filepath), next);
        }, function(err, resp) {
            if (err && err.type === 'BizwebInvalidRequestError') {
                bizweb.notify('Error deploying theme ' + JSON.stringify(err.detail), true);
            } else if (!err) {
                bizweb.notify('Theme deploy complete.');
            }

            done(err);
        });
    };

    /*
     * Download an asset from Bizweb.
     *
     * @param {string} filepath
     * @param {Function} done
     */
    bizweb.download = function(filepath, done) {
        var api = bizweb._getApi(),
            themeId = bizweb._getThemeId(),
            key = bizweb._makeAssetKey(filepath);
            console.log(key);
        function onRetrieve(err, obj) {
            if (err) {
                if (err.type === 'BizwebInvalidRequestError') {
                    bizweb.notify('Error downloading asset file ' + JSON.stringify(err.detail), true);
                }

                return done(err);
            }

            if (!obj.asset) {
                return done(new Error('Failed to get asset data'));
            }

            bizweb._saveAsset(key, obj, done);
        }

        if (themeId) {
            api.asset.retrieve(themeId, key, onRetrieve);
        } else {
            api.assetLegacy.retrieve(key, onRetrieve);
        }
    };

    bizweb.sync = function(filepath, done) {
        var api = bizweb._getApi(),
            themeId = bizweb._getSyncThemeId(),
            key = bizweb._makeAssetKey(filepath);

        function onRetrieve(err, obj) {
            if (err) {
                if (err.type === 'BizwebInvalidRequestError') {
                    bizweb.notify('Error downloading asset file ' + JSON.stringify(err.detail), true);
                }

                return done(err);
            }

            if (!obj.asset) {
                return done(new Error('Failed to get asset data'));
            }

            bizweb._saveAsset(key, obj, done);
        }

        if (themeId) {
            api.asset.retrieve(themeId, key, onRetrieve);
        } else {
            api.assetLegacy.retrieve(key, onRetrieve);
        }
    };

    /*
     * Download an entire theme from Bizweb.
     *
     * @param {Function} done
     */
    bizweb.downloadTheme = function(done) {
        var api = bizweb._getApi();
        var themeId = bizweb._getThemeId(),
            basePath = bizweb._getBasePath();

        function onRetrieve(err, obj) {
            if (err) {
                if (err.type === 'BizwebInvalidRequestError') {
                    bizweb.notify('Error downloading theme ' + JSON.stringify(err.detail), true);
                }

                return done(err);
            }

            if (!obj.assets) {
                return done(new Error('Failed to get theme assets list'));
            }

            async.eachSeries(obj.assets, function(asset, next) {
                bizweb.download(path.join(basePath, asset.key), next);
            }, function(err) {
                if (!err) {
                    bizweb.notify('Theme download complete.');
                }

                done(err);
            });
        }

        if (themeId) {
            api.asset.list(themeId, onRetrieve);
        } else {
            api.assetLegacy.list(onRetrieve);
        }
    };

    /*
     * Download an entire theme from Bizweb.
     *
     * @param {Function} done
     */
    bizweb.syncTheme = function(done) {
        var api = bizweb._getApi();
        var themeId = bizweb._getSyncThemeId(),
            basePath = bizweb._getBasePath();

        function onRetrieve(err, obj) {
            if (err) {
                if (err.type === 'BizwebInvalidRequestError') {
                    bizweb.notify('Error downloading theme ' + JSON.stringify(err.detail), true);
                }

                return done(err);
            }

            if (!obj.assets) {
                return done(new Error('Failed to get theme assets list'));
            }

            async.eachSeries(obj.assets, function(asset, next) {
                bizweb.sync(path.join(basePath, asset.key), next);
            }, function(err) {
                if (!err) {
                    bizweb.notify('Theme download complete.');
                }

                done(err);
            });
        }

        if (themeId) {
            api.asset.list(themeId, onRetrieve);
        } else {
            api.assetLegacy.list(onRetrieve);
        }
    };

    /*
     * Display the list of available themes.
     *
     * @param {Function} done
     */
    bizweb.themes = function(done) {
        var api = bizweb._getApi();

        api.theme.list(function(err, obj) {
            if (err) {
                return done(err);
            }

            if (!obj.themes) {
                return done(new Error('Failed to get themes list'));
            }

            obj.themes.forEach(function(theme) {
                var str = theme.id + ' - ' + theme.name;

                if (theme.role.length > 0) {
                    str += ' (' + theme.role + ')';
                }

                grunt.log.writeln(str);
            });

            done();
        });
    };

    bizweb.watchHandler = function(action, filepath) {
        function errorHandler(err) {
            if (err) {
                bizweb.notify(err.message, true);
            }
        }

        if (!bizweb._isWatchedPath(filepath)) {
            return;
        }

        if (action === 'deleted') {
            bizweb.remove(filepath, errorHandler);
        } else if (grunt.file.isFile(filepath)) {
            switch (action) {
                case 'added':
                case 'changed':
                case 'renamed':
	                bizweb.upload(filepath, errorHandler);
	                break;
            }
        } else {
            bizweb.notify('Skipping non-file ' + filepath);
        }
    };

    return bizweb;
}