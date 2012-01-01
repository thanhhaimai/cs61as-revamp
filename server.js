/** debug flags. */
var DEBUG = false;

/** Setting up dependencies. */
var express = require('express');
var app = module.exports = express.createServer();
var mongoose = require('mongoose');
var mongoStore = require('connect-mongodb');
var schema = require('./schema.js');
var fs = require('fs');

/** Database. */
var db;

/** Flash message support. */
app.helpers(require('./dh.js').helpers);
app.dynamicHelpers(require('./dh.js').dynamicHelpers);

/** Student database URI. */
app.set('db-uri', 'mongodb://admin:scheme@staff.mongohq.com:10082/cs61as');

/** Model for a User and a LoginToken that will be used for remembering
  * users who have logged in before. */
schema.defineModels(mongoose, function() {
  app.User = User = mongoose.model('User');
  app.Video = Video = mongoose.model('Video');
  app.Reading = Reading = mongoose.model('Reading');
  app.Assignment = Assignment = mongoose.model('Assignment');
  app.Lesson = Lesson = mongoose.model('Lesson');
  app.LoginToken = LoginToken = mongoose.model('LoginToken');
  app.Grade = Grade = mongoose.model('Grade');
  db = mongoose.connect(app.set('db-uri'));
});

/** Set up server, session management. */
app.use(express.favicon(__dirname + '/public/favicon.ico', { maxAge: 2592000000 })); 
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({ secret: 'this sucks', store: mongoStore(db) }));
app.use(express.static(__dirname + '/public'));

/** Where to look for templates. */
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

/** Determines if a user is already logged in. */
function loadUser(req, res, next) {
  if (req.session.user_id) {
    User.findById(req.session.user_id, function(err, user) {
      if (err) {
        // user not logged in
        if (DEBUG) console.log(err);
        res.redirect('/home');
      }

      req.currentUser = user;
      Lesson.findOne({ number: user.progress }, function(err, lesson) {
        if (err) {
          // lesson not found
          if (DEBUG) console.log(err);
          req.flash('error', 'Looks like there is something wrong with your account. Please see an administrator.');
          res.redirect('/home');
        }

        req.currentLesson = lesson;
        next();
      });
    });
  } else {
    res.redirect('/home');
  }
}

/** Default view iff logged in. */
app.get('/', loadUser, function(req, res){
  res.redirect('/dashboard');
});

/** Default view iff not logged in. */
app.get('/home', function(req, res) {
  // QUESTION: why user here?
  // ANSWER: I don't quite remember...
  res.render('index', { page: 'home', user: new User() });
});

/** Student dashboard. */
// TODO: Separate TA/Admin dashboard.
app.get('/dashboard', loadUser, function(req, res) {
  if (req.currentUser.username === 'guest') {
    res.redirect('/lessons');
  } else {
    res.render('dashboard', { page: 'dashboard', currentUser: req.currentUser, currentLesson: req.currentLesson });
  }
});

/** Webcast viewing. */
app.get('/webcast', loadUser, function(req, res) {
  var num = req.currentUser.progress;
  var vids = [];
  Lesson.findOne({ number: num }, function(err, lesson) {
    if (DEBUG && err) console.log(err);
    if (!err) {
      vids = lesson.videos;
      res.render('video', { page: 'webcast', currentUser: req.currentUser, vids: vids, byurl: false });
    } else {
      req.flash('error', 'Whoops! This video does not exist.');
      res.redirect('/dashboard');
    }
  });
  
});

/** Viewing a webcast by ID. */
app.get('/webcast/id/:videoID', loadUser, function(req, res) {
  res.render('video', { page: 'webcast', currentUser: req.currentUser, url: req.params.videoID, byurl: true });

});

/** Viewing previously completed webcasts. */
app.get('/webcast/:number', loadUser, function(req, res) {
  var num = req.params.number;
  var vids = [];
  if (req.currentUser.progress < num) {
    req.flash('error', 'You have not gotten this far yet!');
    res.redirect('/webcast');
  } else {
    Lesson.findOne({ number: num }, function(err, lesson) {
    if (DEBUG && err) console.log(err);
      if (!err) {
        vids = lesson.videos;
        res.render('video', { page: 'webcast', currentUser: req.currentUser, vids: vids, byurl: false });
      } else {
        req.flash('error', 'The webcast you requested does not exist.');
        res.redirect('/webcast');
      }
    });
  }
});

/** Viewing user profiles. */
// TODO: Decide if we should actually allow users to view others' profiles, and if so, what to include.
app.get('/user/:username', loadUser, function(req, res) {
  var username = req.params.username;
  var grades = false;
  if (req.currentUser.username === username) {
    grades = true;
  }
  res.render('profile', { page: 'profile', currentUser: req.currentUser, grades: grades, viewing: username });
});

/** Settings page. */
// TODO: Allow users to change their unit preferences, password, email, etc (maybe profile options if time).
app.get('/settings', loadUser, function(req, res) {
  res.render('settings', { page: 'settings', currentUser: req.currentUser });
});

/** Announcements. */
// TODO: Integrate Wordpress to post updates.
app.get('/blog', loadUser, function(req, res) {

});

/** Administration. */
// TODO: Compile administrative documents onto a static page.
app.get('/administration', loadUser, function(req, res) {
  res.render('administration', { page: 'administration', currentUser: req.currentUser });
});

/** Admin Control Panel. */
// HACK: check permission
app.get('/admin', loadUser, function(req, res) {
  res.render('admin', { page: 'admin/index', currentUser: req.currentUser });
});

/** Manage users. */
app.get('/admin/users', loadUser, function(req, res) {
  User.find({}, function(err, users) {
    if (DEBUG && err) console.log(err);
    res.render('admin/users', { page: 'admin/users/index', currentUser: req.currentUser, users : users });
  });
});

/** Add an user. */
app.post('/admin/users/add', loadUser, function(req, res) {
  var user = new User({
    username: req.body.user.username,
    email: req.body.user.email,
  });
  user.password = req.body.user.password;
  user.save(function(err) {
    if (DEBUG && err) console.log(err);
  });
  User.find({}, function(err, users) {
    if (DEBUG && err) console.log(err);
    res.render('admin/users', { page: 'admin/users/index', currentUser: req.currentUser, users : users });
  });
});

/** Edit an user. */
app.get('/admin/users/edit/:userID', loadUser, function(req, res) {
  User.findById(req.params.userID, function(err, user) {
    if (DEBUG && err) console.log(err);
    res.render('admin/users/edit', { page: 'admin/users/edit', currentUser: req.currentUser, user : user });
  });
});

/** Save edit an user. */
// TODO: implement
app.post('/admin/users/edit/:userID', loadUser, function(req, res) {
  User.findById(req.params.userID, function(err, user) {
    if (DEBUG && err) console.log(err);
    user.username = req.body.user.username;
    user.email = req.body.user.email;
    user.password = req.body.user.password;
    user.save();
    res.render('admin/users/edit', { page: 'admin/users/edit', currentUser: req.currentUser, user : user });
  });
});

/** A standard login post request. */
app.post('/login', function(req, res) {
  User.findOne({ username: req.body.user.username }, function(err, user) {
    if (DEBUG && err) console.log(err);
    if (user && user.authenticate(req.body.user.password)) {
      req.session.user_id = user._id;
      res.redirect('/dashboard');
    } else {
      req.flash('error', 'Invalid username or password.');
      res.redirect('/home');
    }
  }); 
});

/** Guest login. */
// TODO: Make better?
app.get('/guest', function(req, res) {
  req.session.user_id = '4efea835bbf696a72500001f';
  res.redirect('/dashboard');
});

/** Logging out. */
app.get('/logout', loadUser, function(req, res) {
  if (req.session) {
    // LoginToken.remove({ username: req.currentUser.username }, function() {});
    //res.clearCookie('logintoken');
    req.flash('info', 'Logged out successfully!');
    req.session.destroy(function() {});
  }
  // How to get flash to work if session is destroyed?
  res.redirect('/home');
});

/** Collective lessons. */
app.get('/lessons', loadUser, function(req, res) {
  Lesson.find({}, function(err, lessons) {
    if (DEBUG && err) console.log(err);
    res.render('lessons', { page: 'lessons', currentUser: req.currentUser, lessons: lessons });
  });
});

/** Homework. */
app.get('/homework/:number', loadUser, function(req, res) {
  var num = req.params.number;
  res.render('homework', { page: 'homework', currentUser: req.currentUser, currentLesson: req.currentLesson });
});

/** Redirect everything else back to dashboard if logged in. */
app.get('*', function(req, res) {
  req.flash('error', "Whoops! The url you just went to does not exist.");
  res.redirect('/');
});



// TODO: Search function



/** Start server. */
var port = process.env.PORT || 8084;
app.listen(port);


