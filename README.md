Starbound Files
===============

This package makes it easy to parse the contents of Starbound's various
file formats.

**Note:** This package currently only supports HTML5 `File` objects.


Example
-------

Here's how you might use this package to extract a sound from the
assets file:

```js
var starbound = require('starbound-files');

// Create an assets manager which will deal with package files etc.
var assets = starbound.assets.createManager();

// Assume root is an entry for the Starbound root directory.
var root = ...;
root.getDirectory('assets', {}, function (entry) {
  // This will scan the assets directory for all files and also index
  // the contents of .pak files.
  assets.addRoot(entry, function () {
    // Welcome to the jungle!
    var sound = '/sfx/environmental/jungle_day.ogg';
    assets.getBlobURL(sound, function (err, url) {
      var audio = new Audio();
      audio.autoplay = true;
      audio.src = url;
      document.body.appendChild(audio);
    });
  });
});
```
