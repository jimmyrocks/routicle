// Open a database connection
var mongoose = require('mongoose');
var config = require('./config');
var allUsers = "!All_Users";
var express = require('express');
var paths = require('./rest');
var backboneConfig = require("./backboneTools");
var app = express();
var pjson = require ('../package.json');


// Set up the database based on environment
exports.routes = function(env) {

    var getUserRole = function (req){return "admin";};

    allowXSS(config, app);
    readConfig(env, function(tables) {
        tables.map(function(table) {
            paths.addService(app, table, getUserRole);
        });

        // Allow backbone access to the tables
        paths.returnJson(
            app,
            function(newMode) {
                var allTables = [];
                tables.map(function(table){
                    allTables.push(backboneConfig.formatTable(table, newMode));
                });
                return JSON.stringify(allTables);
            },
            "/tables",
            getUserRole
        );

        paths.returnJson(
            app,
            function(newMode){return JSON.stringify(pjson)},
            "/appInfo",
            getUserRole
        );
    });

    // Return backbone compatible JSON for the browser side

    return app;
};

var allowXSS = function(configFile, app) {
    // Allow Cross Site Requests
    var allowCrossDomain = function(req, res, next) {
        var methods = 'GET,PUT,POST,DELETE,OPTIONS';
        if (configFile.allowedHosts[req.headers.host]) {
            res.header('Access-Control-Allow-Credentials', true);
            res.header('Access-Control-Allow-Origin', req.headers.origin);
            res.header('Access-Control-Allow-Methods', methods);
            res.header('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
            // intercept OPTIONS method
            if ('OPTIONS' == req.method) {
                res.send(200);
            } else {
                next();
            }
        } else {
            res.send(403, {auth: false});
        }
    };

    if (configFile.allowedHosts) {
        app.use(allowCrossDomain);
    }
    //app.use(express.favicon());
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
};



var readConfig = function(env, callback) {

    // Define the database connection
    mongoose.connect(config.databases[env]);
    var db = mongoose.connection;
    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', function callback () {
        console.log("Database Connected: " + config.databases[env]);
        loadRest();
    });

    var loadRest = function() {
        //Convert the tables to Mongoose tables
        var mongooseTables = [];

        // Since JSON doesn't support types
        var typeLookup = {
            "string": String,
            "number": Number,
            "array": Array,
            "date": Date,
            "boolean": Boolean,
            "object": Object
        };

        // Function to convert the CRUD string into T/F values
        var convertCrud = function(crudObject) {

            var splitCrud = function(crudString) {
                var crudObject = {};
                crudString.split('').map(function(character) {
                    if (character) {
                        crudObject[character.toLowerCase()] = true;
                    }
                });
                return crudObject;
            };

            var newCrudObject = {};
            for (var permissionLevel in crudObject) {
                if (crudObject.hasOwnProperty(permissionLevel)) {
                    newCrudObject[permissionLevel] = splitCrud(crudObject[permissionLevel]);
                }
            }
            return newCrudObject;
        };

        var addQueryFields = function(query, fieldName, pushTo) {
            if(query && Object.prototype.toString.call( query ) === '[object Array]' ) {
                query.map(function(queryObject) {
                    // Build the query field if it exists, as well as its
                    // associated CRUD matrix
                    queryObject.dbField = fieldName;
                    queryObject.crud = convertCrud(queryObject.crud);
                    pushTo.push(queryObject);
                });
            }
        };

        var addDisplayFields = function(permissionLevels, fieldName, addTo) {

            var addField = function(newPermissionLevels) {
                addTo.push({'name': fieldName, permissions: newPermissionLevels});
            };

            if (permissionLevels && Object.prototype.toString.call( permissionLevels ) === '[object Array]' ) {
                addField(permissionLevels);
            } else {
                addField([allUsers]);
            }
        };

        // Loop through the tables and build them
        config.tables.map(function(table) {
            var tableObject = {};
            // Add the display name
            tableObject.displayName = table.displayName;
            tableObject.queryFields = [];
            tableObject.displayFields = [];
            tableObject.defaultField = "_id"; // Default to the _id field

            // Add the allowed hosts - Does this need to be set on a per table basis?
            tableObject["allowedHosts"] = config.allowedHosts;

            // Create the schema and the queries
            var schema = {};
            for (var fieldName in table.fields) {
                if (table.fields.hasOwnProperty(fieldName)) {
                    var field = table.fields[fieldName];
                    schema[fieldName] = typeLookup[field["type"].toLowerCase()];
                    // Query Fields
                    addQueryFields(field['query'], fieldName, tableObject["queryFields"]);
                    addDisplayFields(field['displayField'], fieldName, tableObject["displayFields"]);
                    if (field.isDefault) {tableObject["defaultField"] = fieldName;}
               }
            }

            // Create the Table Level crud Matrix
            tableObject["crud"] = convertCrud(table["tableCrud"]);

            // Create the model
            tableObject["model"] = mongoose.model(
                table.internalName,
                mongoose.Schema(schema)
            );

            // Deal with the mongo field queries
            if (table["mongoFields"]) {
                for (var mongoFieldName in table.mongoFields) {
                    if (table.mongoFields.hasOwnProperty(mongoFieldName)) {
                        addQueryFields(table.mongoFields[mongoFieldName].query, mongoFieldName, tableObject["queryFields"]);
                        addDisplayFields(table.mongoFields[mongoFieldName]['displayField'], mongoFieldName, tableObject["displayFields"]);
                    }
                }
            }

            tableObject["allUsersParam"] = allUsers;

            // Add it to the larger mongooseTables
            mongooseTables.push(tableObject);
        });

        // Send back to caller
        callback(mongooseTables);
    };
};

