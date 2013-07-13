// Open a database connection
var mongoose = require('mongoose');
var config = require('./config');
var allUsers = "!All_Users";
var express = require('express');
var paths = require('./rest');
var app = express();


// Set up the database based on environment
exports.routes = function(env) {    

    var userRole = "admin";
    init(env, function(tables) {
        tables.map(function(table) {
            paths.addService(app, table, userRole);
        });
    });

    return app;
};

var init = function(env, callback) {

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

            var addPermission = function(permissionLevel) {
                if (addTo[permissionLevel]) {
                    addTo[permissionLevel].push(fieldName);
                } else {
                    addTo[permissionLevel] = [fieldName];
                }
            };

            if (permissionLevels && Object.prototype.toString.call( permissionLevels ) === '[object Array]' ) {
                permissionLevels.map(addPermission);
            } else {
                addPermission(allUsers);
            }
        };


        // Loop through the tables and build them
        config.tables.map(function(table) {
            var tableObject = {};
            // Add the display name
            tableObject.displayName = table.displayName;
            tableObject["queryFields"] = [];
            tableObject["displayFields"] = [];

            // Create the schema and the queries
            var schema = {};
            for (var fieldName in table.fields) {
                if (table.fields.hasOwnProperty(fieldName)) {
                    var field = table.fields[fieldName];
                    schema[fieldName] = typeLookup[field["type"].toLowerCase()];
                    // Query Fields
                    addQueryFields(field['query'], fieldName, tableObject["queryFields"]);
                    addDisplayFields(field['displayField'], fieldName, tableObject["displayFields"]);
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

