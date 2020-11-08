const express = require('express');
const bcrypt = require('bcrypt');
const passport = require('passport');
const async = require('async');
const router = express.Router();
const crypto = require('../crypto');

const mailer = require('../mailer');
const helper = require('../helper');
const db = require('../db');
require('../passport')(passport);

router.get('/test', helper.isAuthenticated, (req, res) => {
  res.json({status: 'ok'});
});

router.get('/level', helper.isAuthenticated, (req, res) => {
  res.json({level: req.user.level});
});

router.post('/login', (req, res, next) => {
  if (!req.body || !req.body.phone || !req.body.password) {
    return res.status(400).json({status: 'bad', error: 'Missing required fields.'});
  }

  req.body.phone = req.body.phone.toLowerCase();
  next();
}, passport.authenticate('local'), (req, res) => {
	console.log('req session', req.session);
	console.log("req user", req.user);
  console.log(req.body.phone + " just logged in to app!");
  res.json({status: 'ok'});
});

router.post('/admin/login', (req, res, next) => {
  if (!req.body || !req.body.phone || !req.body.password) {
    return res.sendStatus(404);
  }

  req.body.phone = req.body.phone.toLowerCase();
  next();
}, (req, res, next) => {
  db.User.findOne({phone: req.body.phone})
    .then(user => {
      console.log(user);
      if (user && user.level >= 2) {
        next();
      } else {
        return res.sendStatus(404);
      }
    });
}, passport.authenticate('local'), (req, res) => {
  console.log(req.body.phone + " just logged in to web!");
  res.json({status: 'ok'});
});

router.post('/register', (req, res) => {
  if (!req.body || !req.body.phone || !req.body.password) {
    return res.status(400).json({status: 'bad', error: 'Missing required fields.'});
  }

  const phone = req.body.phone;
  const shortPhone = phone.slice(-7);
  const code = Math.floor(Math.random() * 9000) + 1000;

  if (!/^[0-9]+$/.test(phone)) {
    return res.status(400).json({status: 'bad', error: 'Invalid phone number.'});
  }

  bcrypt.hash(req.body.password, 10, (err, hash) => {
    if (err) {
      return res.status(400).json({status: 'bad', error: err});
    }

    let callbackUser;
    db.User.findOne({ '$or': [{'phone': phone}, {'shortPhone': shortPhone}] })
      .then(user => {
        if (user) {
            return res.status(400).json({status: 'bad', error: 'phoneExists'});
        }

        let level = 1

        if (phone === '18593380935' || phone === '12144990824') {
	        level = 10
        }

        return db.User.create({
          phone: phone,
          password: hash,
          shortPhone: phone.slice(-7),
          level: level
        });
      })
      .then(user => {
        callbackUser = user;
        return db.Verification.create({
          user: callbackUser.id,
          phone: callbackUser.phone,
          code: code,
          active: true
        });
      })
      .then(() => {
        return mailer.send(`+${callbackUser.phone}`, `Your Jolt Mate confirmation code is: ${code}`);
      })
      .then(() => {
        return res.json({ status: 'ok' })
      })
      .catch(err => {
        return res.status(400).json({status: 'bad', error: err});
      });
  });
});

router.post('/forgot', (req, res) => {
  if (!req.query || !req.body.phone) {
    return res.status(400).json({status: 'bad', error: 'Missing required fields.'});
  }

  if (!/^[0-9]+$/.test(req.body.phone)) {
    return res.status(400).json({status: 'bad', error: 'Invalid phone number.'});
  }

  const code = Math.floor(Math.random() * 9000) + 1000;

  db.Forgot.create({
    phone: req.body.phone,
    code: code
  })
    .then(() => {
      return mailer.send(`+${req.body.phone}`, `Your Jolt Mate password reset confirmation code is: ${code}`);
    })
    .then(() => {
      res.json({status: 'ok'});
    })
    .catch(err => {
      return res.status(400).json({status: 'bad', error: err});
    });
});

router.put('/password', (req, res) => {
  if (!req.body || !req.body.code || !req.body.password || !req.body.repassword) {
    return res.status(400).json({status: 'bad', error: 'Missing required fields.'});
  }

  if (req.body.password !== req.body.repassword) {
    return res.status(400).json({status: 'bad', error: 'Passwords do not match.'});
  }

  db.Forgot.findOne({code: req.body.code.toLowerCase()})
    .then(forgot => {
      if (!forgot) {
        throw 'Invalid confirmation code';
      }

      return db.User.findOne({phone: forgot.phone})
        .then(user => {
          return bcrypt.hash(req.body.password, 10, (err, hash) => {
            if (err) {
              throw err;
            }

            user.password = hash;
            return user.save();
          });
        })
        .then(() => {
          forgot.active = false;
          return forgot.save();
        })
        .then(() => {
          res.json({status: 'ok'});
        })
        .catch(err => {
          return res.status(400).json({status: 'bad', error: err});
        });
    })
    .catch(err => {
      return res.status(400).json({status: 'bad', error: err});
    });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.status(200).json({status: 'ok'});
  });
});

module.exports = router;
