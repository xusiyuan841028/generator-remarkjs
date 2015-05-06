/*
 * Created on 2015-05-07 00:57
 *
 * By Phoenix Xu
 */

/* global process */
/* jshint globalstrict: true */
'use strict';

var fs = require('fs');

var gulp = require('gulp');
var plugins = require('gulp-load-plugins')();
var util = plugins.util;
var connect = plugins.connect;
var imagemin = plugins.imagemin;
var uglify = plugins.uglify;
var minifyHTML = plugins.minifyHtml;
var gIf = plugins.if;
var templateCache = plugins.angularTemplatecache;
var requirejs = plugins.requirejs;
var replace = plugins.replace;

// Images optimizers
//var gifsicle = require('imagemin-gifsicle');
var jpegtran = require('imagemin-jpegtran');
var optipng = require('imagemin-optipng');
var svgo = require('imagemin-svgo');

var bower = require('bower');
var es = require('event-stream');
var sh = require('shelljs');
var del = require('del');
var _ = require('lodash');


var INDENT = '    ';
var TEMPLATE_TAG = '/*SLUG_TEMPLATES*/';

var argv = require('yargs')
  .alias('m', 'mobile')
  .alias('w', 'web')
  .options('r', {
    alias: 'root',
    default: 'src'
  })
  .options('d', {
    alias: 'dest',
    default: 'www'
  })
  .argv;

var config = {
  productType: argv.mobile ? 'mobile' : 'web',
  release: argv._.indexOf('release') > -1 || argv._.indexOf('release-serve') > -1,
  root: argv.root,
  destination: argv.dest,
  listTasks: argv['tasks-simple']
};

var port = {
  serve: 8000
};

var temp = '.tmp';

var dist = {
  common: config.destination
};
'images fonts css slug lib js agent'.split(' ').forEach(function (type) {
  dist[type] = config.destination + '/' + type;
});

var src = {
  sass: [
    config.root + '/sass/**/*.scss'
  ],
  templates: [
    config.root + '/slug/**/*.jade'
  ],
  html: [
    config.root + '/common/*.jade'
  ],
  images: [
    config.root + '/images/**/*'
  ],
  fonts: [
    config.root + '/fonts/*'
  ],
  slug: [
    config.root + '/slug'
  ],
  js: [
    config.root + '/common/*.js'
  ],
  agent: [
    config.root + '/agent/**/*'
  ]
};

function noop() {
}

function createFileList(files) {
  return util.colors.green(INDENT + files.join('\n    '));
}

function clean(glob, type, done) {
  if (!_.isArray(glob)) {
    glob = [glob];
  }
  del(glob, function () {
    util.log('Clean', type, 'files:\n' + createFileList(glob));
    (done || noop)();
  });
}

function createPlumberStream(task) {
  return plugins.plumber({
    errorHandler: function (error) {
      util.log(util.colors.red(error.plugin + ': ' + error.message));
      // TODO: Why sass task is always running when a render error occurs?!
      if (task) {
        task.running = false;
      }
    }
  });
}

function printMessageHeader() {
  var ASTERISK_LINE = new Array(80).join('*');

  var generateMessage = function (string) {
    return '* ' + string + new Array(ASTERISK_LINE.length - string.length - 2).join(' ') + '*';
  };

  var println = function (string) {
    util.log(util.colors.blue(string));
  };

  println(ASTERISK_LINE);
  println(generateMessage('Product Type:  ' + config.productType.toUpperCase()));
  println(generateMessage('Build Root  :  ' + config.destination));
  println(ASTERISK_LINE);
}

/* Get all packages' version semver used as the hash suffix */
var bowerManifest = require('./bower.json');
var packages = {};

_.forOwn(bowerManifest.dependencies, function (version, module) {
  packages[module] = require('./' + bower.config.directory + '/' + module + '/.bower.json').version;
});

_.extend(config, {
  version: bowerManifest.version,
  packages: packages
});

// For gulp completion
config.listTasks || printMessageHeader();

/**
 * Default
 */
gulp.task('default', ['build']);

/**
 * Clean files
 */
gulp.task('clean', [
  'clean:tmp',
  'clean:fonts',
  'clean:images',
  'clean:js',
  'clean:css',
  'clean:html'
]);

gulp.task('clean:tmp', function (done) {
  clean(temp, 'temporary', done);
});

gulp.task('clean:fonts', function (done) {
  clean(dist.fonts, 'font', done);
});

gulp.task('clean:images', function (done) {
  clean(dist.images, 'image', done);
});

gulp.task('clean:html', function (done) {
  clean(dist.common + '/*.html', 'html', done);
});

gulp.task('clean:templates', function (done) {
  clean(dist.slug + '/**/*.html', 'templates', done);
});

gulp.task('clean:js', function (done) {
  clean(dist.js + '/**/*.js', 'js', done);
});

gulp.task('clean:slug', function (done) {
  clean(dist.slug + '/**/*.js', 'slug js', done);
});

gulp.task('clean:css', function (done) {
  clean(dist.css, 'css', done);
});

gulp.task('clean:lib', function (done) {
  clean(dist.lib, 'lib', done);
});

gulp.task('clean:agent', function (done) {
  clean(dist.agent, 'agent', done);
});

/**
 * Compile sass to css
 */
gulp.task('sass', ['clean:css'], function () {
  var sassTask = this.tasks.sass;
  return gulp.src(src.sass)
    .pipe(createPlumberStream(sassTask))
    .pipe(plugins.sass())
    .pipe(plugins.if(config.release, plugins.minifyCss({
      keepSpecialComments: 0
    })))
    .pipe(plugins.if(config.release, plugins.rename({
      extname: '.min.css'
    })))
    .pipe(gulp.dest(dist.css))
    .pipe(connect.reload());
});

var createJadeStream = function (options) {
  options = options || {};
  options = _.defaults(options, {
    pretty: !config.release,
    locals: {
      config: config
    }
  });
  return plugins.jade(options);
};

function createMinifyHTMLStream() {
  return gIf(config.release, minifyHTML());
}

/**
 * Compile jade templates to html
 */
gulp.task('jade:common', ['clean:html'], function () {
  return gulp.src(src.html)
    .pipe(createPlumberStream())
    .pipe(createJadeStream())
    .pipe(createMinifyHTMLStream())
    .pipe(gulp.dest(dist.common))
    .pipe(connect.reload());
});

gulp.task('jade:templates', ['clean:templates'], function () {
  return gulp.src(src.templates)
    .pipe(createPlumberStream())
    .pipe(createJadeStream())
    .pipe(createMinifyHTMLStream())
    .pipe(gulp.dest(dist.slug))
    .pipe(connect.reload());
});

/**
 * Copy files to distribution folder
 */
gulp.task('copy', [
  'copy:js',
  'copy:images',
  'copy:fonts',
  'copy:lib',
  'copy:agent'
]);

gulp.task('copy:agent', ['clean:agent'], function () {
  return gulp.src(src.agent)
    .pipe(gulp.dest(dist.agent))
    .pipe(connect.reload());
});

gulp.task('copy:js', ['clean:js'], function () {
  return gulp.src(src.js)
    .pipe(gulp.dest(dist.js))
    .pipe(connect.reload());
});

gulp.task('copy:slug', ['clean:slug'], function () {
  return gulp.src(src.slug + '/**/*.js')
    .pipe(gulp.dest(dist.slug))
    .pipe(connect.reload());
});

gulp.task('copy:images', ['clean:images'], function () {
  return gulp.src(src.images)
    .pipe(imagemin({
      progressive: true,
      svgoPlugins: [{removeViewBox: false}],
      use: [
        jpegtran(),
        optipng(),
        svgo()
      ]
    }))
    .pipe(gulp.dest(dist.images))
    .pipe(connect.reload());
});

gulp.task('copy:fonts', ['clean:fonts'], function () {
  return gulp.src(src.fonts)
    .pipe(gulp.dest(dist.fonts))
    .pipe(connect.reload());
});

gulp.task('copy:lib', ['clean:lib'], function () {
  function copyLibs(libs) {
    var streams = libs.map(function (lib) {
      return gulp.src(bower.config.directory + lib.path)
        .pipe(gulp.dest(dist.lib + lib.dest));
    });

    return es.merge.apply(es, streams)
      .pipe(connect.reload());
  }

  return copyLibs([
    {
      path: '/ionic/release/**/*.*',
      dest: '/ionic'
    },
    {
      path: '/requirejs/**.*',
      dest: '/requirejs'
    },
    {
      path: '/jquery/dist/**.*',
      dest: '/jquery'
    },
    {
      path: '/angular/**.*',
      dest: '/angular'
    },
    {
      path: '/angular-animate/**/*.*',
      dest: '/angular-animate'
    },
    {
      path: '/angular-sanitize/**/*.*',
      dest: '/angular-sanitize'
    },
    {
      path: '/angular-ui-router/**/*.*',
      dest: '/angular-ui-router'
    },
    {
      path: '/angularAMD/**/*.*',
      dest: '/angularAMD'
    },
    {
      path: '/angular-local-storage/dist/*.*',
      dest: '/angular-local-storage'
    },
    {
      path: '/animate.css/**/*.*',
      dest: '/animate.css'
    },
    {
      path: '/text/**/*.*',
      dest: '/text'
    },
    {
      path: '/Chart.js/*.*',
      dest: '/Chart.js/'
    },
    {
      path: '/tc-angular-chartjs/dist/*.*',
      dest: '/tc-angular-chartjs/'
    },
    {
      path: '/lodash/dist/*.*',
      dest: '/lodash'
    }
  ]);
});

/**
 * Install
 */
gulp.task('install', ['git-check'], function () {
  return bower.commands.install()
    .on('log', function (data) {
      util.log('bower', util.colors.cyan(data.id), data.message);
    });
});

gulp.task('git-check', function (done) {
  if (!sh.which('git')) {
    util.log(
      '  ' + util.colors.red('Git is not installed.'),
      '\n  Git, the version control system, is required to download Ionic.',
      '\n  Download git here:', util.colors.cyan('http://git-scm.com/downloads') + '.',
      '\n  Once git is installed, run \'' + util.colors.cyan('gulp install') + '\' again.'
    );
    process.exit(1);
  }
  done();
});

gulp.task('cordova-check', function (done) {
  var red = util.colors.red;
  var cyan = util.colors.cyan;
  if (!sh.which('cordova')) {
    util.log(
      '  ' + red('Cordova is not installed.'),
      '\n  Cordova is required to package mobile apps.',
      '\n  Install Cordova:',
      '\n  ' + INDENT + cyan('npm install cordova -g')
    );
    process.exit(1);
  }
  done();
});

/**
 * Prepare for release the package
 */
gulp.task('build', [
  'clean',           // Clean the generated files
  'sass',            // Compile SASS
  'jade:common',     // Compile common JADE
  'copy',            // Copy files
  'jade:templates',  // Compile template JADE
  'copy:slug'        // Copy slug javascripts
]);

/**
 * Release
 */
gulp.task('release', [
  'clean',          // Clean the generated files
  'sass',           // Compile SASS
  'jade:common',    // Compile JADE
  'copy',           // Copy files
  'template-cache', // Generate template cache
  'requirejs'       // Merge javascript
]);

/**
 * Connect
 */
gulp.task('connect', ['copy'], function () {
  connect.server({
    root: config.destination,
    livereload: true,
    port: port.serve
  });
});

/**
 * Watch
 */
gulp.task('watch', function () {
  gulp.watch(bower.config.directory + '/**/*', ['copy:lib']);
  gulp.watch(src.html, ['jade:common']);
  gulp.watch(src.templates, [config.release ? 'requirejs' : 'jade:templates']);
  gulp.watch(src.sass, ['sass']);
  gulp.watch(src.fonts, ['copy:fonts']);
  gulp.watch(src.images, ['copy:images']);
  gulp.watch(src.js, ['copy:js']);
  gulp.watch(src.slug + '/**/*.js', [config.release ? 'requirejs' : 'copy:slug']);
});

/**
 * Open
 */
gulp.task('open:serve', ['copy'], function () {
  gulp.src(dist.common + '/index.html')
    .pipe(plugins.open('', {
      url: 'http://localhost:' + port.serve
    }));
});

/**
 * Web Serve
 */
gulp.task('serve', [
  'build',
  'watch',
  'connect',
  'open:serve'
]);

/**
 * Web Serve as Release env
 */
gulp.task('release-serve', [
  'release',
  'watch',
  'connect',
  'open:serve'
]);

// REQUIREJS VRIABLES
// Get the list of external dependencies from bower json except requirejs
var requirePlugins = ['text'];
var excludeDependencies = ['jquery', '_', 'ionic',
  'ngIonic', 'angular', 'uiRouter', 'ngAnimate', 'ngSanitize', 'ngAMD', 'ngload', 'ngChart', 'chartjs', 'ngStorage', 'text'];
var mockPathsForDependencies = {};

excludeDependencies.forEach(function (item) {
  mockPathsForDependencies[item] = 'empty:';
});

requirePlugins.forEach(function (item) {
  mockPathsForDependencies[item] = '../bower_modules/' + item + '/' + item;
});

gulp.task('requirejs', ['template-cache'], function () {
  return requirejs({
    baseUrl: 'src',
    include: bowerManifest.name + '/' + bowerManifest.name,
    exclude: excludeDependencies,
    paths: mockPathsForDependencies,
    out: bowerManifest.name + '.js'
  })
    .pipe(replace(TEMPLATE_TAG, fs.readFileSync(temp + '/templates.js')))
    .pipe(uglify())
    .pipe(gulp.dest(dist.slug));
});

gulp.task('template-cache', ['clean:tmp'], function () {
  return gulp.src([config.root + '/**/*.jade', '!' + config.root + '/common/*.jade'])
    .pipe(createPlumberStream())
    .pipe(createJadeStream())
    .pipe(createMinifyHTMLStream())
    .pipe(templateCache({
      module: 'slug.templates'
    }))
    .pipe(gulp.dest(temp));
});
