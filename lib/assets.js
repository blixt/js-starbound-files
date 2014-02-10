var package = require('./package');

// Used to prevent warnings in the browser.
var MIME_TYPES = {
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.wav': 'audio/x-wav'
};

var assetsProto = {
  /**
   * Adds a package to this assets manager.
   */
  addPackage: function (fileEntry, callback) {
    var self = this;
    package.open(fileEntry, function (err, pak) {
      if (err) {
        callback(err);
        return;
      }

      pak.getIndex(function (err, index) {
        if (err) {
          callback(err);
          return;
        }

        // Register the package in the asset manager.
        self._packages.push(pak);

        // Put all the package index entries into the asset manager index.
        for (var i = 0; i < index.length; i++) {
          self._indexAsset(index[i], pak);
        }

        callback(null, pak);
      });
    });
  },

  /**
   * Indexes a directory. All files in the directory will be reachable through
   * the assets manager after this completes. All .pak/.modpak files will also
   * be loaded into the index.
   *
   * The virtual path argument is a prefix for the entries in the directory.
   */
  addDirectory: function (virtualPath, dirEntry, callback) {
    var self = this;

    var pending = 1;
    var decrementPending = function () {
      pending--;
      if (!pending) {
        callback(null, null);
      }
    };

    var reader = dirEntry.createReader();
    var next = function () {
      reader.readEntries(function (entries) {
        if (!entries.length) {
          process.nextTick(decrementPending);
          return;
        }

        entries.forEach(function (entry) {
          if (entry.name[0] == '.') return;

          var path = virtualPath + '/' + entry.name;

          if (entry.isDirectory) {
            pending++;
            self.addDirectory(path, entry, decrementPending);
          } else {
            var dotIndex = entry.name.lastIndexOf('.');
            var extension = entry.name.substr(dotIndex).toLowerCase();
            if (extension == '.pak' || extension == '.modpak') {
              pending++;
              self.addPackage(entry, decrementPending);
            } else {
              self._indexAsset(path, entry);
            }
          }
        });
        next();
      });
    };
    next();
  },

  /**
   * Same as addDirectory, but assumes the provided directory entry is for the
   * root assets directory.
   */
  addRoot: function (dirEntry, callback) {
    this.addDirectory('', dirEntry, callback);
  },

  getBlobURL: function (path, callback) {
    if (!this._index[path]) {
      callback(new Error('Path is not in index'));
    }

    if (path in this._cache) {
      var cacheObject = this._cache[path];
      cacheObject.lastAccess = Date.now();
      callback(null, cacheObject.url);
      return;
    }

    var self = this;
    var container = this._index[path];

    // Handle file entries.
    if (container.isFile) {
      container.file(function (file) {
        var url = URL.createObjectURL(file);

        var cacheObject = {
          lastAccess: Date.now(),
          url: url
        };
        self._cache[path] = cacheObject;

        callback(null, url);
      }, function (err) {
        callback(err);
      });

      return;
    }

    // Assume anything else is a package.
    container.get(path, function (err, buffer) {
      if (err) {
        callback(err);
        return;
      }

      // Get the mimetype for the extension so that the Blob can be provided
      // correctly.
      var dotIndex = path.lastIndexOf('.');
      var extension = path.substr(dotIndex).toLowerCase();

      var meta = {};
      if (extension in MIME_TYPES) {
        meta.type = MIME_TYPES[extension];
      }

      var blob = new Blob([buffer], meta);
      var url = URL.createObjectURL(blob);

      var cacheObject = {
        lastAccess: Date.now(),
        url: url
      };
      self._cache[path] = cacheObject;

      callback(null, url);
    });
  },

  _indexAsset: function (virtualPath, container) {
    if (virtualPath in this._index) {
      // XXX: Not sure how to handle this case so only warn for now.
      console.warn(virtualPath + ' already in index');
    }

    this._index[virtualPath] = container;
  }
};

exports.createManager = function () {
  return Object.create(assetsProto, {
    _cache: {value: {}},
    _index: {value: {}},
    _packages: {value: []}
  });
};
