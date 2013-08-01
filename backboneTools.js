exports.formatTable = function(table, userMode) {
    // Copy everything as JSON
    var newTable = {}; //JSON.parse(JSON.stringify(table));

    var extractCrud = function(crudPermissions) {
        var newCrud = null;
        for (var permission in crudPermissions) {
            if (crudPermissions.hasOwnProperty(permission)) {
                if (permission === userMode) {
                    newCrud = crudPermissions[permission];
                }
            }
        }
        return newCrud;
    };

    var extractPermission = function (permissionList) {
        var newPermission = permissionList.filter(function(permission) {
            return (permission === userMode || permission === table.allUsersParam) ? true : false;
        });
        return newPermission.length;
    };

    var convertId = function(field) {
        return field === "_id" ? "id" : field;
    };

    // Remove any references to modes that aren't this mode
    newTable.crud = extractCrud(table.crud);
    newTable.queryFields = [];
    table.queryFields.map(function(queryField) {
        var newCrud = extractCrud(queryField.crud);
        if (newCrud) {
            newTable.queryFields.push({
                'crud': newCrud,
                'name': queryField.name,
                'dbField': convertId(queryField.dbField)
            });
        }
    });
    var newDisplayFields = [];
    table.displayFields.map(function(field) {
        var permissionCount = extractPermission(field.permissions);
        if (permissionCount > 0) {
            newDisplayFields.push(convertId(field.name));
        }
    });
    newTable.displayFields = newDisplayFields;
    newTable.defaultField = convertId(table.defaultField);
    newTable.displayName = table.displayName;
    newTable.pathName = table.model.modelName;

    return newTable;
};
