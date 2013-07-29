var renderResult = function (req, res, jsonResult, title) {

    // Functions 
    // ///////////////////////////////
    // Read Params here
    var getParams = function(req) {
        // Deal with any params after a question mark
        var newParamsRaw = req._parsedUrl.query ? req._parsedUrl.query.split("&") : [];
        var newParams = {};
        newParamsRaw.map(function(params) {
            var param = params.split(/=(.*)/, 2);
            if (param.length === 2) {
                newParams[param[0].toLowerCase()] = param[1];
            }
        });
        return newParams;
    };
    // Convert output to jsonp if required
    var toJsonp = function(json) {
        if (queryParams.callback) {
            return queryParams.callback + "(" + json + ");";
        } else {
            return json;
        }
    };
    //////////////////////////////////

    // Read the Params
    var queryParams = getParams(req);

    // Pretty print output if required
    var indent = queryParams.pretty ? 4 : null;
    // Run parse and stringify (possibly again), this will format it with the indent as well as escape anything weird
    var jsonString = JSON.stringify(JSON.parse(jsonResult), null, indent);

    if (req.params && req.params.format === "json" || req.params.format === "jsonp") {
        // Write out the JSON to the user
        res.writeHead(200, {'Content-Type' : 'application/json' });
        res.write(toJsonp(jsonString));
        res.end();
    } else {
        // Return as HTML

        // Clean up the object before sending it out
        var returnedObject = JSON.parse(jsonString);
        if (!(returnedObject instanceof Array)) {returnedObject = [returnedObject];}
        res.render('index', { "title": title, "data": returnedObject});
    }
};

exports.addService = function(app, table, mode) {
    // return the data in a useful format
    var formatData = function(documents, req, res, returnFirstOnly) {

        // Deal with returns of single items
        if (returnFirstOnly && documents) {
            documents = documents[0];
        }

        // Deal with undefined documents
        documents = documents ? documents : [];

        // Filter the output based on user settings
        var filter = [];
        table.displayFields.map(function(field) {
            field.permissions.map(function(newPermission) {
                if (newPermission == mode(req) || newPermission == table.allUsersParam) {
                    filter.push(field.name);
                }
            });
        });

        var getJsonString = function(currDocuments, currFilter){
            var returnValue;
            var convertId = function(record) {
                record.id = record._id;
                delete record._id;

                if (currFilter.indexOf("_id") > -1) {
                    currFilter[currFilter.indexOf("_id")] = "id";
                }
            };

            if (currDocuments instanceof Array) {
                currDocuments.map(convertId);
                returnValue = JSON.stringify(currDocuments.map(function(output){return output;}), currFilter);
            } else {
                convertId(currDocuments);
                returnValue = JSON.stringify(currDocuments, currFilter);
            }

            return returnValue;
        };

        var jsonResult = getJsonString(documents, filter);
        var pageTitle = table.model.modelName;

        // Render the Result to the Browser
        renderResult(req, res, jsonResult, pageTitle);
    };

    var checkPermission = function(req, res, level, method, callback) {
        if (level.crud[mode(req)][method]) {
            callback();
        } else {
            res.send(401, "Unauthorized");
        }
    };

    // List All
    app.get('/' + table.model.modelName + '.:format', function(req, res) {
        checkPermission(req, res, table, "r", function(){
            table.model.find().lean().exec(function (err, documents) {
                formatData(documents, req, res, false);
            });
        });
    });
    // Create
    app.post('/' + table.model.modelName + '.:format?', function(req, res) {
        checkPermission(req, res, table, "c", function(){
            var newDocument = new table.model(req.body);
            newDocument.save(function() {
                table.model.findById(newDocument._id).lean().exec(function (err, document) {
                    formatData([document], req, res, true);
                });
            });
        });
    });

    var createQuery = function(thisField) {
        // Internal Functions
        // Create a function for the query
        var queryFunction = function(field) {
            var returnValue = {};
            var query = {};
            query[thisField.operator] = [field];
            returnValue[thisField.dbField] = query;
            return returnValue;
        };

        // Read Function
        var getCurrentData = function (req, res) {
            table.model.find(queryFunction(req.params.field)).lean().exec(function (err, documents) {
                formatData(documents, req, res, req.returnOne);
            });
        };

       // Update Function
       var updateCurrentData = function (req, res) {
           table.model.find(queryFunction(req.params.field), function (err, documents) {
               console.log("req.params.field", req.params);
               console.log("documents", documents);
               if (documents && documents.length > 0) {
                   console.log("woo!");
                   var callbackCount = 0;
                   documents.map(function(doc) {
                   console.log("doc", doc);
                       for (var field in req.body) {
                           if (req.body[field]) {
                               doc[field] = req.body[field];
                               doc.save(function(err) { // TODO make this a seperate function
                                   callbackCount++;
                                   if (callbackCount === documents.length) {
                                       getCurrentData(req, res, req.returnOne);
                                   }
                               });
                           }
                       }
                   });
               } else {
                   formatData(documents, req, res, req.returnOne);
               }
           });
       };

       //Delete Function
       var deleteCurrentData = function (req, res, returnOne) {
           table.model.find(queryFunction(req.params.field), function (err, documents) {
               if(documents && documents.length) {
                   var callbackCount = 0;
                   documents.map(function(doc) {
                       doc.remove(function (err) {
                           doc.save(function (save_err) {
                               callbackCount++;
                               if (callbackCount === documents.length) {
                                   formatData(documents, req, res, req.returnOne);
                               }
                           });
                       });
                   });
               } else {
                   formatData(documents, req, res, returnOne);
               }
           });
       };

        // Crud lookup
        var crudLookup = {
            //"c": "post",
            "r": "get",
            "u": "put",
            "d": "del"
        };
        var reqLookup = {
            //"POST": createCurrentData,
            "GET": getCurrentData,
            "PUT": updateCurrentData,
            "DELETE": deleteCurrentData
        };
        // Add the REST methods
        for (var method in crudLookup) {
            app[crudLookup[method]]('/' + table.model.modelName + '/' + thisField.name + '/' + ':field.:format?', function(req, res){
                checkPermission(req, res, thisField, method, function(){
                    reqLookup[req.method](req, res);
                });
            });

            // Check if this is the default method, and add the defaults as well
            if (table.defaultField === thisField.dbField) {
                app[crudLookup[method]]('/' + table.model.modelName + '/' + ':field.:format?', function(req, res) {
                    checkPermission(req, res, thisField, method, function(){
                        req.returnOne = true;
                        reqLookup[req.method](req, res);
                    });
                });
            }
        }
    };

    // Create the REST/CRUD fields
    var fieldMatrix = table.queryFields;
    table.queryFields.map(function(queryField) {
        createQuery(queryField);
    });
};

exports.returnJson = function(app, jsonOutput, path, mode) {

    console.log(path + ".:format?");
    app.get(path + ".:format?", function(req, res) {
        // Return the JSON to the requester
        var newJson = jsonOutput(mode(req));
        res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
        renderResult(req, res, newJson, "Request: " + path);
    });
};
