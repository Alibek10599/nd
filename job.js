const express      = require('express');
const multer       = require('multer');
const parse        = require('csv-parse');
const fs           = require('fs');
const _            = require('lodash');
const uuid         = require('uuid/v4');
const path         = require('path');
const async        = require('async');
const notification = require('../notification');
const rewards      = require('../rewards');
const helper       = require('../helper');
const mailer       = require('../mailer');
const dateformat   = require('dateformat');
const request      = require('request');
const socket       = require('../socket')
const upload       = multer({
        storage   : multer.diskStorage({
                destination: (req, file, next) => {
                        next(null, './assets/')
                },
                filename   : (req, file, next) => {
                        next(null, uuid() + path.extname(file.originalname));
                }
        }),
        limits    : {
                fileSize: 5e+6
        },
        fileFilter: (req, file, next) => {
                const accepted = ['text/csv'];
                next(null, _.includes(accepted, file.mimetype));
        }
});
const router       = express.Router();

const google = require('../google');
const db     = require('../db');


router.get('/test', (req, res) => {
        const user   = req.user;
        let fromName = user.profile.fullName ? user.profile.fullName : user.phone;
        let title    = fromName + ' posted a job';
        
        db.User.findById(user.id)
                .populate('connections.user')
                .then(user => {
                        notification.notifyFriends(title, '', user, {type: 'job', id: job.id});
                        return res.json('cool');
                })
                .catch(err => {
                        return res.status(400).json({status: 'bad', error: err});
                })
});

router.get('/industry', (req, res) => {
        db.Industry.find({})
                .then(ind => {
                        res.json(ind);
                })
                .catch(err => {
                        return res.status(400).json({status: 'bad', error: err});
                })
});


router.post('/industry', (req, res) => {
        if (!req.body || !req.body.name) {
                return res.status(400).json({status: 'bad', error: 'Missing required fields.'});
        }
        
        const user = req.user;
        if (user.level < 10) {
                return res.status(400).json({status: 'bad'});
        }
        
        if (req.body.subIndustry && req.body.subIndustry.length > 0) {
                db.Industry.findById(req.body.subIndustry)
                        .then(ind => {
                                if (!ind) {
                                        return res.status(400).json({status: 'bad', error: 'Invalid sub-industry.'});
                                }
                                ind.subIndustry.push({name: req.body.name});
                                return ind.save()
                        })
                        .then(() => {
                                res.json({status: 'ok'});
                        })
                        .catch(err => {
                                res.status(400).json({status: 'bad', error: err});
                        })
        } else {
                db.Industry.create({name: req.body.name})
                        .then(() => {
                                res.json({status: 'ok'});
                        })
                        .catch(err => {
                                res.status(400).json({status: 'bad', error: err});
                        });
        }
});


router.delete('/industry', (req, res) => {
        if (!req.body || !req.body.industry) {
                return res.status(400).json({status: 'bad', error: 'Missing required fields.'});
        }
        
        const user = req.user;
        if (user.level < 10) {
                return res.status(400).json({status: 'bad'});
        }
        
        db.Industry.findById(req.body.industry)
                .then(ind => {
                        if (req.body.subIndustry) {
                                ind.subIndustry.pull(req.body.subIndustry);
                                return ind.save();
                        } else {
                                ind.remove();
                                return ind.save();
                        }
                })
                .then(() => {
                        res.json({status: 'ok'});
                })
                .catch(err => {
                        return res.status(400).json({status: 'bad', error: err});
                });
});

router.post('/import', upload.single('file'), (req, res) => {
        if (!req.file) {
                return res.status(400).json({status: 'bad', error: 'Unknown error.'});
        }
        
        fs.readFile(req.file.path, 'utf8', (err, data) => {
                if (err) {
                        return res.status(400).json({status: 'bad', error: err});
                }
                
                parse(data, {columns: ['company', 'title', 'type', 'summary', 'salary', 'salaryType', 'contactName', 'contact', 'zip', 'country', 'city', 'industry', 'subIndustry', 'skills']}, (err, output) => {
                        
                        if (err) {
                                return res.status(400).json({status: 'bad', error: err});
                        }
                        
                        const user = req.user;
                        
                        async.each(output, (row, next) => {
                                let index = output.indexOf(row)
                                if (index == 0) {
                                        return next();
                                }
                                return db.Job.create({
                                        user       : user.id,
                                        company    : row.company,
                                        jobTitle   : row.title,
                                        industry   : {
                                                industry   : row.industry,
                                                subIndustry: row.subIndustry || undefined
                                        },
                                        appliedBy  : [],
                                        seenBy     : [],
                                        skills     : row.skills.split(','),
                                        type       : row.type.toLowerCase(),
                                        description: row.summary,
                                        salary     : row.salary,
                                        contactName: row.contactName,
                                        contact    : row.contact,
                                        country    : row.country,
                                        city       : row.city,
                                        zip        : row.zip
                                })
                                        .then(job => {
                                                return db.User.findById(user.id)
                                                        .then(user => {
                                                                user.jobs.push(job);
                                                                return user.save();
                                                        });
                                        })
                                        .then(() => {
                                                next();
                                        })
                                        .catch(next);
                        }, (err) => {
                                if (err) {
                                        return res.status(400).json({status: 'bad', error: err});
                                }
                                
                                return res.json({status: 'ok'});
                        });
                });
        });
});

router.get('/', (req, res) => {
        const user   = req.user;
        const sortBy = req.query.sortBy;
        
        db.User.findById(user.id).populate('profile.skills.standard')
                .then(user => {
                        const users = user.connections.map(conn => conn.user);
                        const skills = user.profile.skills.standard.concat(user.profile.skills.custom)
                        let query = {
                                user: {'$in': users},
                                $or: [
                                        { isCurated: false },
                                        { 
                                                skills: {
                                                        $elemMatch: {
                                                                $in: skills.map(v => v.name)
                                                        }
                                                }
                                        }
                                ]
                        };
                        
                        if (req.query.type) {
                                query.type = req.query.type;
                        }
                        
                        if (req.query.minSalary) {
                                if (query.salary === undefined) {
                                        query.salary = {};
                                }
                                query.salary['$gt'] = req.query.minSalary;
                        }
                        
                        if (req.query.maxSalary) {
                                if (query.salary === undefined) {
                                        query.salary = {};
                                }
                                query.salary['$lt'] = req.query.maxSalary;
                        }
                        
                        if (req.query.industry) {
                                query['industry.industry'] = req.query.industry;
                                
                                if (req.query.subIndustry) {
                                        query['industry.subIndustry'] = req.query.subIndustry;
                                }
                        }
                        
                        if (req.query.lat && req.query.lng) {
                                query.location = {'$near': [req.query.lat, req.query.lng]};
                        }
                        
                        // if (sortBy === 'distance') {
                        //   query.location = {'$near': [user.location[0], user.location[1]]}
                        // }
                        
                        if (sortBy === 'skills') {
                                if (query.skills === undefined) {
                                        query.skills = {};
                                }
                                
                                query.skills['$in'] = req.query.skills.split(',');
                        }
                        query.spam = false;
                        return db.Job.find(query, null, sortBy === 'time' ? {sort: {'created': -1}} : null)
                                .skip(+req.query.offset || 0)
                                .limit(+req.query.limit || 25)
                                .exec()
                })
                .then(jobs => {
                        res.json(jobs);
                })
                .catch(err => {
                        return res.status(400).json({status: 'bad', error: err});
                });
});


router.get('/search', (req, res) => {
        if (!req.query && !req.query.jobTypes && (!req.query.location || !req.query.jobTypes)) {
                return res.status(400).json({status: 'bad', error: 'Missing required fields.'});
        }
        
        if (req.query.type !== 'fuzzy' && req.query.type !== 'exact') {
                return res.status(400).json({status: 'bad', error: 'Invalid type.'});
        }
        
        const exact = req.query.type === 'exact';
        
        let allTypes = ['freelance', 'part-time', 'full-time'];
        
        let result = [];


///////////////////////////////
		db.User.findById(req.user.id)
        .then(user => {
              let connsFilter = user.connections.filter(conn => conn.relationship == 'connected');
              const users = connsFilter.map(conn => conn.user);
        
              let query = {
                'connections.user': {'$in': users},
              };
              
              return db.User.find(query).select('-contacts').populate({path:'jobs', match: {spam: false}});
        })
		.then(users => {
				async.each(users, (user, next) => {
						if (user.id === req.user.id) {
								// if (user.id ===  '5be2228b4b9bdd7dcae8bbd6') {
								return next();
						}
						
						if (result.indexOf(user) > -1) {
								return next();
						}
						
						if (user.jobs.length == 0) {
								return next();
						}
						
						const check = result.find(usr => {
								return usr.id === user.id;
						});
						
						if (check) {
								return next();
						}
						
						var filtered = user.jobs;
						
						if (req.query.location) {
								const separatedLocation = req.query.location.split(',');
								filtered                = filtered.filter((j) => {
										if (separatedLocation.length > 0 && j.city.toLowerCase().includes(separatedLocation[0].toLowerCase().trim())) {
												return true;
										}
										/* 	// As customer requested, i commented these 2 compare sentences
										if( separatedLocation.length>1&& j.country.toLowerCase().includes(separatedLocation[1].toLowerCase().trim()) ) {
											return true;
										}
										if( separatedLocation.length>2&& j.zip.toLowerCase().includes(separatedLocation[2].toLowerCase().trim()) ) {
											return true;
										}
										*/
										return false;
								});
						}
						
						if (req.query.skills) {
								filtered = filtered.filter((j) => _.intersection(j.skills.map((a) => a.toLowerCase()), req.query.skills.split(',').map((a) => a.toLowerCase())).length > 0);
						}
						
						if (req.query.jobTypes) {
								filtered = filtered.filter((j) => req.query.jobTypes.includes(j.type));
						}
						
						//Filtering spammed jobs
						filtered = filtered.filter((j)=> !j.spam);
						
						if (filtered.length == 0) {
								return next()
						}
						
						user.jobs = filtered;
						result.push(user);
						return next();
						
						
				})
		})
		.then(() => {
				res.json(result);
		})
		.catch(err => {
				res.status(400).json({status: 'bad', error: err});
		});
});


router.post('/', (req, res) => {
        if (!req.body || !req.body.company || !req.body.jobTitle || !req.body.zip || !req.body.industry || !req.body.type || !req.body.description || !req.body.salary || !req.body.salaryType || !req.body.contactName || !req.body.contact || !req.body.country || !req.body.city) {
                return res.status(400).json({status: 'bad', error: 'Missing required fields.'});
        }
        
        const user = req.user;
        
        
        db.Job.create({
                user       : user.id,
                company    : req.body.company,
                jobTitle   : req.body.jobTitle,
                isCurated  : req.body.isCurated,
                industry   : {
                        industry   : req.body.industry,
                        subIndustry: req.body.subIndustry || undefined
                },
                skills     : req.body.skills,
                type       : req.body.type,
                description: req.body.description,
                salary     : req.body.salary,
                salaryType : req.body.salaryType,
                contactName: req.body.contactName,
                contact    : req.body.contact,
                zip        : req.body.zip,
                country    : req.body.country,
                city       : req.body.city,
                spam : false,
                created    : new Date(),
        })
                .then(job => {
                        return db.User.findById(user.id)
                                .populate('connections.user')
                                .then(user => {
                                        user.jobs.push(job);
                                        let fromName = user.profile.fullName ? user.profile.fullName : user.phone;
                                        let title    = fromName + ' posted a job';
                                        let message  = job.jobTitle + " • " + job.company + " • " + job.description;
                                        
                                        notification.notifyFriends(title, message, user, {type: 'job', id: job.id});
                                        
                                        socket.informFriends('newJob', user, job.id);
                                        
                                        user.save();
                                        return helper.reCalculateRank(user)
                                });
                })
                .then(() => {
                        res.json({status: 'ok'});
                })
                .then(() => {
                        rewards.redeem(user, Rewards.POST_JOB, () => {
                        
                        });
                })
                .catch(err => {
                        res.status(400).json({status: 'bad', error: err});
                });
});

router.put('/:id', (req, res) => {
        if (!req.body || !req.body.company || !req.body.jobTitle || !req.body.zip || !req.body.industry || !req.body.type || !req.body.description || !req.body.salary || !req.body.salaryType || !req.body.contactName || !req.body.contact || !req.body.country || !req.body.city) {
                return res.status(400).json({status: 'bad', error: 'Missing required fields.'});
        }
        
        const user = req.user;
        
        db.Job.findById(req.params.id)
                .then(job => {
// 	  job.id = req.params.id
                        job.company  = req.body.company
                        job.jobTitle = req.body.jobTitle
                        
                        let industry         = {}
                        industry.industry    = req.body.industry
                        industry.subIndustry = req.body.subIndustry || undefined
                        job.industry         = industry
                        job.isCurated        = req.body.isCurated
                        job.skills           = req.body.skills
                        job.type             = req.body.type
                        job.description      = req.body.description
                        job.salary           = req.body.salary
                        job.salaryType       = req.body.salaryType
                        job.contactName      = req.body.contactName
                        job.contact          = req.body.contact
                        job.zip              = req.body.zip
                        job.country          = req.body.country
                        job.city             = req.body.city
                        job.created          = new Date()
                        
                        return job.save()
                })
                .then(job => {
                        return db.Job.findById(req.params.id)
                })
                .then(job => {
                        res.json(job)
                })
                .catch(err => {
                        res.status(400).json({status: 'bad', error: err});
                });
});

router.get('/:id', (req, res) => {
        
        db.Job.findById(req.params.id)
                .populate('appliedBy')
                .then(job => {
                        console.log(job);
                        res.json(job);
                })
                .catch(err => {
                        res.status(400).json({status: 'bad', error: err});
                })
});

router.delete('/:id', (req, res) => {
        let user = req.user;
        db.Job.findById(req.params.id)
                .then(job => {
                        return db.User.findById(user.id)
                                .populate('connections.user')
                                .then(user => {
                                        socket.informFriends('deleteJob', user, req.params.id);
                                        job.remove();
                                        return job.save();
                                })
                })
                .then(() => {
                        res.json({status: 'ok'});
                })
                .catch(err => {
                        res.status(400).json({status: 'bad', error: err});
                })
});

router.post('/:id/favorite', (req, res) => {
        const user = req.user;
        
        db.Job.findById(req.params.id)
                .populate('user')
                .then(job => {
                        if (job.user.toString() === user.id) {
                                throw 'You can\'t share your own jobs.';
                        }
                        
                        if (job.favoritedBy.indexOf(user.id) > -1) {
                                job.favoritedBy.pull(user.id);
                        } else {
                                job.favoritedBy.push(user.id);
                        }
                        
                        return job.save()
                })
                .then(job => {
                        return db.User.findById(user.id)
                                .populate('connections.user')
                                .then(user => {
                                        if (user.favoritedJobs.indexOf(job.id) > -1) {
                                                user.favoritedJobs.pull(job.id);
                                        } else {
                                                user.favoritedJobs.push(job);
                                                
                                                let fromName = user.profile.fullName;
                                                let message  = fromName + " favorited your job " + job.jobTitle;
                                                
                                                notification.notify('', message, job.user, {type: 'job', id: job.id});
                                        }
                                        
                                        return user.save();
                                })
                })
                .then(() => {
                        res.json({status: 'ok'});
                })
                .then(() => {
                        rewards.redeem(user, Rewards.FAVORITE_JOB, () => {
                        
                        });
                })
                .catch(err => {
                        res.status(400).json({status: 'bad', error: err});
                });
});

router.delete('/:id/favorite', (req, res) => {
        const user = req.user;
        
        db.User.findById(user.id)
                .then(user => {
                        user.favoritedJobs.pull(user.id);
                        return user.save();
                })
                .then(() => {
                        res.json({status: 'ok'});
                })
                .catch(err => {
                        res.status(400).json({status: 'bad', error: err});
                });
});


router.post('/:id/share', (req, res) => {
        const user     = req.user;
        let updatedJob = {};
        
        db.Job.findById(req.params.id)
                .populate('user')
                .then(job => {
                        if (job.user.toString() === user.id) {
                                throw 'You can\'t share your own jobs.';
                        }
                        
                        if (job.sharedBy.indexOf(user.id) > -1) {
                                job.sharedBy.pull(user.id);
                        } else {
                                job.sharedBy.push(user.id);
                        }
                        
                        jobUser = job.user;
                        
                        return job.save()
                })
                .then(job => {
                        return db.User.findById(user.id)
                                .populate('connections.user')
                                .then(user => {
                                        if (user.sharedJobs.indexOf(job.id) > -1) {
                                                user.sharedJobs.pull(job.id);
                                                user.jobs.pull(job.id);
                                        } else {
                                                user.sharedJobs.push(job);
                                                user.jobs.push(job);
                                                
                                                let fromName = user.profile.fullName;
                                                let message  = fromName + " shared your job " + job.jobTitle;
                                                
                                                notification.notify('', message, job.user, {type: 'job', id: job.id});
                                        }
                                        
                                        return user.save();
                                })
                })
                .then(() => {
                        return db.Job.findById(req.params.id)
                                .then(job => {
                                        updatedJob = job;
                                })
                })
                .then(() => {
                        res.json(updatedJob);
                })
                .catch(err => {
                        res.status(400).json({status: 'bad', error: err});
                });
});

router.get('/:id/applied', (req, res) => {
        db.Job.findById(req.params.id)
                .populate({path: 'appliedBy', populate: {path: 'jobs items'}})
                .then(result => {
                        res.json(result.appliedBy);
                })
                .catch(err => {
                        res.status(400).json({status: 'bad', error: err});
                });
})

router.get('/:id/viewed', (req, res) => {
        db.Job.findById(req.params.id)
                .populate({path: 'viewedBy', populate: {path: 'jobs items'}})
                .then(result => {
                        res.json(result.viewedBy);
                })
                .catch(err => {
                        res.status(400).json({status: 'bad', error: err});
                });
})


//New end-point to to get users who share specific job
router.get('/:id/shared', (req, res) => {
        db.Job.findById(req.params.id)
                .populate({path: 'sharedBy', populate: {path: 'jobs items'}})
                .then(result => {
                        res.json(result.sharedBy);
                })
                .catch(err => {
                        res.status(400).json({status: 'bad', error: err});
                });
})


router.post('/:id/apply', (req, res) => {
        const user     = req.user;
        let updatedJob = {};
        
        
        let html = req.body.html
        db.Job.findById(req.params.id)
                .populate('user')
                .then(job => {
                        if (job.user.toString() === user.id) {
                                throw 'You can\'t apply to your own jobs.';
                        }
                        
                        if (job.appliedBy.indexOf(user.id) > -1) {
                                throw 'You already applied to this job';
                        }
                        
                        job.appliedBy.push(user.id);
                        let fromName = user.profile.fullName;
                        let message  = fromName + " applied to your job " + job.jobTitle;
                        
                        notification.notify('', message, job.user, {type: 'job', id: job.id});
                        
                        return job.save()
                })
                .then(job => {
                        return db.User.findById(user.id)
                                .populate('profile.skills.custom')
                                .then(user => {
                                        let subject = '';
                                        
                                        if (job.contact !== user.profile.email) {
                                                subject += 'Ref. By: ' + job.user.profile.fullName + ' | ';
                                        }
                                        
                                        subject += job.jobTitle + ' | Jolt Mate';
                                        
                                        if (user.profile.resume) {
                                                const reqFile = request(user.profile.resume);
                                                reqFile.on('response', function(response) {
                                                  if (response.statusCode === 200) {
                                                        const attachment = response;
                                                        return mailer.sendEmail(user.profile.email, job.contact, subject, html, attachment);
                                                  } else {
                                                        return mailer.sendEmail(user.profile.email, job.contact, subject, html);
                                                  }
                                                });
                                        } else {
                                                return mailer.sendEmail(user.profile.email, job.contact, subject, html);
                                        }
                                })
                })
                .then(() => {
                        return db.Job.findById(req.params.id)
                                .then(job => {
                                        updatedJob = job;
                                })
                })
                .then(() => {
                        res.json(updatedJob);
                })
                .then(() => {
                        rewards.redeem(user, Rewards.APPLY_TO_JOB, () => {
                        
                        });
                })
                .catch(err => {
                        res.status(400).json({status: 'bad', error: err});
                });
        
});


router.get('/:id/review', (req, res) => {
        const user = req.user;
        
        db.Job.findById(req.params.id)
                .populate('user')
                .then(job => {
                        return db.User.findById(user.id)
                                .populate('profile.skills.custom')
                                .then(user => {
                                        let html = '<div style="margin: 50px;">';
                                        html += '<p>Hello ' + job.contactName || job.user.profile.fullName + ',</p><br/>';
                                        html += '<p>This is ' + user.profile.fullName + '. I find the position very interesting and suitable for my career goal(s)</p>';
                                        html += '<p>Short Summary: ' + user.profile.summary + '</p>';
                                        html += '<br/>';
                                        
                                        if (user.profile.resume) {
                                                html += '<p>Please find attached resume.</p>';
                                        } else {
                                                html += '<p>No resume has been attached. Below is the additional details of my job profile.</p>';
                                        }
                                        
                                        if (user.profile.experiences.length > 0) {
                                                html += '<br/>';
                                                html += '<h4>Experience</h4>';
                                                html += '<hr/>';
                                                
                                                user.profile.experiences.forEach(exp => {
                                                        html += '<h5>Job Title</h5>';
                                                        html += '<p>' + exp.title + '</p>';
                                                        html += '<h5>Company</h5>';
                                                        html += '<p>' + exp.company + '</p>';
                                                        html += '<h5>Location</h5>';
                                                        html += '<p>' + exp.location + '</p>';
                                                        html += '<h5>Date</h5>';
                                                        
                                                        let startDate = dateformat(exp.startDate, "mm/dd/yyyy");
                                                        let endDate   = dateformat(exp.endDate, "mm/dd/yyyy");
                                                        
                                                        html += '<p>' + startDate + ' - ' + endDate + '</p>';
                                                        html += '<h5>Description</h5>';
                                                        html += '<p>' + exp.description + '</p>';
                                                });
                                        }
                                        
                                        if (user.profile.educations.length > 0) {
                                                html += '<br/>';
                                                html += '<h4>Education</h4>';
                                                html += '<hr/>';
                                                
                                                user.profile.educations.forEach(edu => {
                                                        html += '<h5>Degree Level</h5>';
                                                        html += '<p>' + edu.field + '</p>';
                                                        html += '<h5>Degree</h5>';
                                                        html += '<p>' + edu.degree + '</p>';
                                                        html += '<h5>School</h5>';
                                                        html += '<p>' + edu.school + '</p>';
                                                        html += '<h5>Date</h5>';
                                                        
                                                        let startDate = dateformat(edu.startDate, "mm/dd/yyyy");
                                                        let endDate   = dateformat(edu.endDate, "mm/dd/yyyy");
                                                        
                                                        html += '<p>' + startDate + ' - ' + endDate + '</p>';
                                                        html += '<h5>Description</h5>';
                                                        html += '<p>' + edu.description + '</p>';
                                                });
                                        }
                                        
                                        if (user.profile.skills.custom.length > 0) {
                                                html += '<br/>';
                                                html += '<h4>Skills</h4>';
                                                html += '<hr/>';
                                                html += '<p>';
                                                
                                                var hasSkills = false;
                                                
                                                user.profile.skills.custom.forEach(skl => {
                                                        html += skl.name + ' , ';
                                                        hasSkills = true;
                                                });
                                                
                                                if (hasSkills) {
                                                        html = html.slice(0, -2);
                                                }
                                                
                                                html += '</p>';
                                        }
                                        
                                        html += '<br/>';
                                        html += '<br/>';
                                        html += '<p>This job has been referred by ' + job.user.profile.fullName + ' (' + job.user.profile.email + ')' + ' and has been applied from the Jolt Mate app.' + '</p>';
                                        
                                        
                                        html += '</div>';
                                        
                                        res.json({"html": html});
                                })
                })
                .catch(err => {
                        res.status(400).json({status: 'bad', error: err});
                });
});

router.post('/:id/view', (req, res) => {
        const user = req.user;
        
        db.Job.findById(req.params.id)
                .populate('user')
                .then(job => {
                        if (job.user.toString() === user.id) {
                                throw 'You can\'t view your own jobs.';
                        }
                        
                        if (job.viewedBy.indexOf(user.id) > -1) {
                                throw 'You already viewed this job';
                        }
                        
                        job.viewedBy.push(user.id);
                        
                        return job.save()
                })
                .then(job => {
                        return db.User.findById(user.id)
                                .then(user => {
                                        user.viewedJobs.push(req.params.id);
                                        
                                        socket.informFriend('viewJob', user.id, user.id, req.params.id);
                                        
                                        return user.save();
                                })
                })
                .then(() => {
                        res.json({status: 'ok'});
                })
                .catch(err => {
                        res.status(400).json({status: 'bad', error: err});
                });
        
});

//New endpoint to update a job's expiration date.
router.post('/:id/extend', (req, res) => {
        db.Job.findById(req.params.id)
                .then(job => {
                        let newDate = new Date(job.expirationDate);
                        newDate.setDate(newDate.getDate() + 30);
                        job.expirationDate = new Date(newDate);
                        return job.save();
                })
                .then(() => {
                        res.json({status: 'ok'});
                })
                .catch(err => {
                        res.status(400).json({status: 'bad', error: err});
                })
});



module.exports = router;
