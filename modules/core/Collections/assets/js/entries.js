(function($){

    App.module.controller("entries", function($scope, $rootScope, $q, $http, $timeout){

        $scope.collection = COLLECTION || {};
        $scope.fields = [];
        $scope.filter = $('input[name="filter"]').val();

        /** @type {array} Promises that should be resolved before loading entries */
        var promisesBeforeLoadEntries = [];

        $scope.fields = (COLLECTION.fields.length ? COLLECTION.fields : [COLLECTION.fields]).filter(function(field){
            return field.lst;
        });

        $scope.remove = function(index, entryId){
            App.Ui.confirm(App.i18n.get("Are you sure?"), function(){

                $http.post(App.route("/api/collections/removeentry"), {

                    "collection": angular.copy($scope.collection),
                    "entryId": entryId

                }, {responseType:"json"}).success(function(data){

                    $timeout(function(){
                        $scope.entries.splice(index, 1);
                        $scope.collection.count -= 1;

                        App.notify(App.i18n.get("Entry removed"), "success");
                    }, 0);
                }).error(App.module.callbacks.error.http);
            });
        };

        // Create hashmap of available linked-collections, key is it's _id
        $scope.linkedCollections = {};

        $scope.collection.fields.forEach(function(field) {

            if (field.type !== 'link-collection' || !field.collectionField) {
                return;
            }

            promisesBeforeLoadEntries.push(
                $http.post(App.route("/api/collections/entries"), {
                    collection: {_id: field.collection}
                })
                .success(function(data) {

                    // Create hashmap of entries, key is it's _id
                    $scope.linkedCollections[field.collection] = {};

                    data.forEach(function(entry) {

                        // Key is entry _id, value is name of entry to show instead of id
                        $scope.linkedCollections[field.collection][entry._id] = entry[field.collectionField];
                    });
                }).error(App.module.callbacks.error.http)
            );
        });

        $scope.loadmore = function() {

            var limit  = COLLECTION.sortfield == 'custom-order' ? 10000 : 25, filter = false;

            if ($scope.filter) {

                var criterias = [], criteria;

                COLLECTION.fields.forEach(function(field){
                    switch(field.type) {
                        case 'text':
                        case 'code':
                        case 'html':
                        case 'markdown':
                        case 'wysiwyg':
                            criteria = {};
                            criteria[field.name] = {'$regex':$scope.filter};
                            criterias.push(criteria);
                            break;
                    }
                });

                if (Object.keys(criteria).length) filter = {'$or':criterias};
            }

            $http.post(App.route("/api/collections/entries"), {

                "collection" : angular.copy($scope.collection),
                "limit"      : limit,
                "filter"     : JSON.stringify(filter),
                "skip"       : $scope.entries ? $scope.entries.length : 0,
                "sort"       : (COLLECTION.sortfield == 'custom-order' ? {"custom-order":1}:false)

            }, {responseType:"json"}).success(function(data){

                if (data) {

                    if (!$scope.entries) {
                        $scope.entries = [];
                    }

                    if (data.length) {

                        // Convert collection link IDs to collection link field values.
                        data.forEach(function(entry) {

                            // Find fields which are type of link-collection
                            $scope.collection.fields.forEach(function(field) {

                                // Continue field is not type of link-collection, 'Field on entries list page' is not selected or is not a collection ID
                                if (field.type !== 'link-collection' || !field.collectionField || typeof entry[field.name] != 'string') {
                                    return;
                                }

                                var linkedCollectionId = field.collection;

                                // Convert to array
                                var linkedEntryIds = (entry[field.name] instanceof Array) ?
                                    entry[field.name] :
                                    [entry[field.name]];

                                // Push field value
                                var fieldValues = linkedEntryIds.map(function(linkedEntryId) {
                                    return $scope.linkedCollections[linkedCollectionId][linkedEntryId];
                                });

                                // Overwrite linked entry id by field value
                                entry[field.name] = fieldValues.join(', ');
                            });
                        });

                        if (data.length < limit) {
                            $scope.nomore = true;
                        }

                        $scope.entries = $scope.entries.concat(data);

                    } else {
                       $scope.nomore = true;
                    }

                }

            }).error(App.module.callbacks.error.http);
        };

        // batch actions

        $scope.selected = null;

        $scope.$on('multiple-select', function(e, data){
            $timeout(function(){
                $scope.selected = data.items.length ? data.items : null;
            }, 0);
        });

        $scope.removeSelected = function(){
            if ($scope.selected && $scope.selected.length) {

                App.Ui.confirm(App.i18n.get("Are you sure?"), function() {

                    var row, scope, $index, $ids = [], collection = angular.copy($scope.collection);

                    for(var i=0;i<$scope.selected.length;i++) {
                        row    = $scope.selected[i],
                        scope  = $(row).scope(),
                        entry  = scope.entry,
                        $index = scope.$index;

                        (function(row, scope, entry, $index){

                            $http.post(App.route("/api/collections/removeentry"), {
                                "collection": collection,
                                "entryId": entry._id
                            }, {responseType:"json"}).error(App.module.callbacks.error.http);

                            $ids.push(entry._id);
                            $scope.collection.count -= 1;

                        })(row, scope, entry, $index);
                    }

                    $scope.entries = $scope.entries.filter(function(entry){
                        return ($ids.indexOf(entry._id)===-1);
                    });
                });
            }
        };

        $scope.emptytable = function() {

            App.Ui.confirm(App.i18n.get("Are you sure?"), function() {
                $http.post(App.route("/api/collections/emptytable"), {

                    "collection": angular.copy($scope.collection)

                }, {responseType:"json"}).success(function(data){

                    $timeout(function(){
                        $scope.entries = [];
                        $scope.collection.count = 0;
                        App.notify(App.i18n.get("Done."), "success");
                    }, 0);

                }).error(App.module.callbacks.error.http);
            });
        };


        var table = $("#entries-table").on("change.uk.sortable",function(){

            var entries = [];

            table.find('tbody').children().each(function(i){

                var entry = angular.copy($(this).scope().entry);

                entry['custom-order'] = i;

                $http.post(App.route("/api/collections/saveentry"), {"collection": COLLECTION, "entry":entry, "createversion": false}).success(function(data){

                }).error(App.module.callbacks.error.http);

                entries.push(entry);
            });

            $scope.$apply(function(){
                $scope.entries = entries;
            });
        });

        $q.all(promisesBeforeLoadEntries)
            .finally($scope.loadmore);
    });

})(jQuery);
