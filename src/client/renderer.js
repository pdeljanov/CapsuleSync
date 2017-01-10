const Config = require('./js/daemon/Config.js');
const Traverse = require('./js/daemon/fs/Traverse.js');
const Filters = require('./js/daemon/capsule/FilterSet.js');

function setup(){

    var config = new Config("App.Settings");
    config.defaults({
        user: { name: "" },
        device: { id: "", prefix: "", name: "" },
        capsules: {  },
        devices: { }
    });

    //var traverser = new Traverse('/home/philip', { 'followLinks': true, 'progressInterval': 200 });
    //traverser.on('progress', (stats) => { console.log(`Time: ${stats.duration}, Files: ${stats.files}, Directories: ${stats.directories}`); });
    //traverser.on('file', (path, stat) => { console.log(`${path} size=${stat.size}`); });
    //traverser.on('directory', (path) => { console.log(`${path}`); });
    //window.capsule.traverse = traverser;

    // let et = new Filters.FilterSet(
    //         new Filters.And(
    //             new Filters.Or(new Filters.SizeFilter('>=', 1024*1024), new Filters.NotEqual(new Filters.TypeFilter())),
    //             new Filters.Or(new Filters.FileNameFilter(), new Filters.CreationTimeFilter())
    //         )
    //     );
    // let serialized = JSON.stringify(et.serialize(), null, 2);
    // console.log(serialized);
    // console.log(Filters.FilterSet.deserialize(JSON.parse(serialized)));

    window.capsule = {};
    window.capsule.config = config;

}

setup();
