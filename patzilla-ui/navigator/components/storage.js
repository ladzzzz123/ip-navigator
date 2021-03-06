// -*- coding: utf-8 -*-
// (c) 2014,2017 Andreas Motl, Elmyra UG
require('blobjs');
var dataurl = require('dataurl').dataurl;
var saveAs = require('file-saver').saveAs;
var localforage = require('localforage');

require('backbone-relational');
require('localforage-backbone');


StoragePlugin = Marionette.Controller.extend({

    initialize: function(options) {
        console.log('StoragePlugin.initialize');
        this.database_version = '1.0.0';
    },

    dump: function() {

        var _this = this;
        var deferred = $.Deferred();

        localforage.keys().then(function(keys) {
            var database = {};
            var deferreds = [];

            // gather all entries
            _.each(keys, function(key) {
                var deferred = $.Deferred();
                deferreds.push(deferred);
                localforage.getItem(key).then(function(value) {
                    database[key] = value;
                    deferred.resolve();
                });
            });

            // save to file
            $.when(deferreds_bundle(deferreds)).then(function() {

                // prepare database dump structure
                var backup = {
                    database: database,
                    metadata: {
                        type: 'patzilla.navigator.database',
                        description: 'IP Navigator database dump',
                        software_version: navigatorApp.config.get('setting.app.software.version'),
                        database_version: _this.database_version,
                        database_name: localforage.config('name'),
                        created: timestamp(),
                        useragent: navigator.userAgent,
                    },
                };

                deferred.resolve(backup);

            });
        });

        return deferred.promise();

    },

    dbexport: function() {

        log('StoragePlugin.dbexport');

        var _this = this;

        this.dump().then(function(backup) {

            // compute payload and filename
            var payload = JSON.stringify(backup, undefined, 4);
            var filename = 'ip-navigator-database_' + now_iso_filename() + '.json';

            // write file
            if (!payload) {
                navigatorApp.ui.notify('Database export failed', {type: 'error', icon: 'icon-save'});
                return;
            }

            var blob = new Blob([payload], {type: "application/json"});
            saveAs(blob, filename);

            // notify user
            var size_kb = Math.round(blob.size / 1000);
            navigatorApp.ui.notify(
                'Database exported successfully, size is ' + size_kb + 'kB.',
                {type: 'success', icon: 'icon-save'});

        });

    },

    dbimport: function(payload) {

        log('StoragePlugin.dbimport');

        var backup = payload;

        if (typeof(payload) == 'string') {

            if (_.string.startsWith(payload, 'data:')) {
                var payload_dataurl = dataurl.parse(payload);
                if (payload_dataurl) {
                    payload = payload_dataurl.data;
                }
                if (!payload_dataurl || !payload) {
                    var message = 'ERROR: Data URL format is invalid';
                    console.error(message + '; payload=' + payload);
                    navigatorApp.ui.notify(message, {type: 'error'});
                    return;
                }
            }

            try {
                backup = jQuery.parseJSON(payload);

            } catch(error) {
                var msg = error.message;
                var message = 'ERROR: JSON format is invalid, ' + msg;
                console.error(message + '; payload=' + payload);
                navigatorApp.ui.notify(message, {type: 'error'});
                return;
            }
        }

        // more sanity checks
        //var filetype = backup && backup['metadata'] && backup['metadata']['type'];
        var filetype = dotresolve(backup, 'metadata.type');
        var database = dotresolve(backup, 'database');

        if (filetype != 'patzilla.navigator.database' && filetype != 'elmyra.ipsuite.navigator.database') {
            var message = 'ERROR: Database dump format "' + filetype + '" is invalid.';
            console.error(message);
            navigatorApp.ui.notify(message, {type: 'error'});
            return;
        }

        if (!database) {
            var message = 'ERROR: Database is empty.';
            console.error(message);
            navigatorApp.ui.notify(message, {type: 'error'});
            return;
        }

        var deferreds = [];
        _.each(_.keys(database), function(key) {
            var deferred = $.Deferred();
            deferreds.push(deferred.promise());
            var value = database[key];

            // datamodel-specific restore behavior
            // merge project lists to get a union of (original, imported)
            // TODO: resolve project name collisions!
            if (key == 'Project') {
                localforage.getItem(key).then(function(original) {
                    if (original && value) {
                        value = _.union(original, value);
                    }
                    localforage.setItem(key, value).then(function() {
                        deferred.resolve();
                    });
                });

            } else {
                localforage.setItem(key, value).then(function(value) {
                    deferred.resolve();
                });
            }
        });

        $.when(deferreds_bundle(deferreds)).then(function() {

            // TODO: get rid of this! here!
            // This should trigger a complete application model bootstrap (coll1.fetch(), coll2.fetch(), etc.),
            // which should most probably be implemented at a central place.

            Backbone.Relational.store.reset();

            // activate project
            navigatorApp.trigger('projects:initialize');

            navigatorApp.ui.notify(
                'Database imported successfully',
                {type: 'success', icon: 'icon-folder-open-alt'});

        });

    },

    dbreset: function(options) {

        log('dbreset');

        options = options || {};

        // make all data control widgets empty
        if (options.shutdown_gui) {
            navigatorApp.shutdown_gui();
        }

        // reset state of orm
        Backbone.Relational.store.reset();
        //Backbone.Relational.store = new Backbone.Store();

        // wipe the data store
        localforage.clear().then(function() {
            log('localforage.clear SUCCESS');
        }, function() {
            log('localforage.clear FAIL');
        });

    },

    setup_ui: function() {

        console.log('StoragePlugin.setup_ui');

        var _this = this;

        // export database
        $('#data-export-button').unbind('click');
        $('#data-export-button').on('click', function(e) {
            _this.dbexport($(this).parent());
        });

        // import database
        // https://developer.mozilla.org/en-US/docs/Using_files_from_web_applications
        $('#data-import-file').unbind('change');
        $('#data-import-file').on('change', function(e) {
            e.stopPropagation();
            e.preventDefault();

            // deactivate project / windows.onfocus
            // otherwise, the default project (e.g. "ad-hoc") would be recreated almost instantly
            navigatorApp.project_deactivate();

            var file = this.files[0];
            if (!file) { return; }
            $(this).val(undefined);

            // Windows workaround
            var file_type = file.type;
            var running_in_hell = _.string.contains(navigator.userAgent, 'Windows');
            if (running_in_hell && file.type == '' && _.string.endsWith(file.name, '.json')) {
                file_type = 'application/json';
            }

            // sanity checks
            if (file_type != 'application/json') {
                var message = 'ERROR: File type is ' + (file_type ? file_type : 'unknown') + ', but should be application/json';
                //log('import message:', message);
                navigatorApp.ui.notify(message, {type: 'error'});
                return;
            }


            var reader = new FileReader();
            reader.onload = function(e) {
                var payload = e.target.result;
                _this.dbimport(payload);

            };
            reader.onerror = function(e) {
                var message = 'ERROR: Could not read file ' + file.name + ', message=' + e.getMessage();
                //log('import message:', message);
                navigatorApp.ui.notify(message, {type: 'error'});
            }
            reader.readAsText(file);

        });

        $('#data-import-button').unbind('click');
        $('#data-import-button').on('click', function(e) {
            navigatorApp.project_deactivate();
            $('#data-import-file').click();
        });


        // reset database
        $('#database-wipe-button').unbind();
        $('#database-wipe-button').click(function(e) {

            navigatorApp.ui.confirm('This will wipe the whole local database including custom keywords. Are you sure?').then(function() {

                // wipe the database
                _this.dbreset({shutdown_gui: true});

                // notify user about the completed action
                navigatorApp.ui.notify(
                    'Database wiped successfully. You should create a new project before starting over.',
                    {type: 'success', icon: 'icon-trash'});

            });

        });

    },

});


// Data storage components
navigatorApp.addInitializer(function(options) {

    var _this = this;

    // Set database name from "context" query parameter
    localforage.config({name: this.config.get('context')});

    // Set localforage driver
    // We use Local Storage here to make introspection easier.
    // TODO: Maybe disable on production
    localforage.setDriver(localforage.LOCALSTORAGE, function() {
        console.info("localforage: Driver is ready");
        _this.trigger('localforage:ready');
    });

    // Import database from url :-)
    // TODO: I'd like this to have storage.js make it on its own, but that'd be too late :-(
    //       check again what we could achieve...
    var database_dump = this.config.get('database');
    if (database_dump) {

        // When importing a database dump, we assign "context=viewer" a special meaning here:
        // the database scope will always be cleared beforehand to avoid project name collisions.
        // Ergo the "viewer" context is considered a *very transient* datastore.
        if (this.config.get('context') == 'viewer') {
            this.storage.dbreset();
        }

        // TODO: project and comment loading vs. application bootstrapping are not synchronized yet
        this.LOAD_IN_PROGRESS = true;

        // TODO: resolve project name collisions!
        this.storage.dbimport(database_dump);
    }

    this.register_component('storage');

});

navigatorApp.addInitializer(function(options) {

    this.storage = new StoragePlugin();

    this.listenTo(this, 'application:ready', function() {
        this.storage.setup_ui();
    });

    this.listenTo(this, 'results:ready', function() {
        this.storage.setup_ui();
    });

});
