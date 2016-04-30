/*
 * grunt-bizweb
 * https://github.com/Codeteria/grunt-bizweb
 */
'use strict';

module.exports = function(grunt) {
	var bizweb = require('./lib/bizweb')(grunt);

	/*
     * Bizweb noop.
     *
     * Use watch to monitor changes. To do an initial upload of all files on
     * your local copy, use the bizweb upload functionality.
     */
    grunt.registerTask('bizweb', function() {
        return true;
    });

    grunt.registerTask('bizweb:download', 'Downloads a single theme file from bizweb, or the entire theme if no file is specified', function(p) {
        var done = this.async();
        if (p) {
          bizweb.download(p, done);
        } else {
          bizweb.downloadTheme(done);
        }
    });

    grunt.registerTask('bizweb:sync', 'Downloads a single theme file from bizweb, or the entire theme if no file is specified', function(p) {
        var done = this.async();
        if (p) {
          bizweb.sync(p, done);
        } else {
          bizweb.syncTheme(done);
        }
    });

    grunt.registerTask('bizweb:themes', 'Displays the list of available themes', function() {
        var done = this.async();

        bizweb.themes(done);
    });

    grunt.registerTask('bizweb:upload', 'Uploads a single theme file to Bizweb, or the entire theme if no file is specified', function(p) {
        var done = this.async();
        var options = {
            noJson: grunt.option('no-json')
        }
        if (p) {
          bizweb.upload(p, done);
        } else {
          bizweb.deploy(done, options);
        }
    });

    grunt.registerTask('bizweb:delete', 'Removes a theme file from Bizweb', function(p) {
        var done = this.async();
        bizweb.remove(p, done);
    });

    /**
     * Grunt watch event
     */
    grunt.event.on('watch', bizweb.watchHandler);
};