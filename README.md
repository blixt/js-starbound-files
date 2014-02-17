Starbound Files
===============

This package makes it easy to parse the contents of Starbound's various
file formats.

**Note:** This package currently only supports HTML5 `File` objects.


Example
-------

```js
var starbound = require('starbound-files');

// Assume file is a File object pointing to a .pak file.
var file = ...;
var pak = starbound.Package.open(file);
console.log('All files in the .pak file:', pak.getIndex());
```
