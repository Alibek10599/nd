const config = require('config');

const mongoose = require('mongoose');
const Schema   = mongoose.Schema;

mongoose.connect(config.get('mongo.uri'));
mongoose.set('debug', config.get('app.verbose') === true);
mongoose.set('useFindAndModify', false);

mongoose.Promise = require('bluebird');

const UserSchema = new Schema({
        phone             : String,
        shortPhone        : String,
        password          : String,
        averageRating: Number,
        profile           : {
                email        : String,
                mainlyHereFor: String,
                enabledVideoResume: {type: Boolean, default: false},
                seekingOpportunityType: String,
                fullName     : String,
                username     : String,
                address      : {
                        city   : {type: String, default: 'Unknown'},
                        state  : String,
                        country: String,
                        zip    : String
                },
                photos       : String,
                summary      : String,
                resume       : String,
                resumeFile   : String,
                experiences  : [{
                        title      : String,
                        company    : String,
                        location   : String,
                        startDate  : Date,
                        endDate    : Date,
                        description: String
                }],
                educations   : [{
                        school     : String,
                        degree     : String,
                        field      : String,
                        startDate  : Date,
                        endDate    : Date,
                        description: String
                }],
                skills       : {
                        standard: [{type: Schema.Types.ObjectId, ref: 'Skill'}],
                        custom  : [{name: String}]
                },
                incentiveTokens       : {type: Number, default: 0},
                purchaseTokens       : {type: Number, default: 0},
                hidden       : {type: Boolean, default: false},
                public       : {type: Boolean, default: true},
                countryCode  : String
        },
        items             : [{type: Schema.Types.ObjectId, ref: 'Item'}],
        blogs             : [{type: Schema.Types.ObjectId, ref: 'Blog'}],
        news              : [{type: Schema.Types.ObjectId, ref: 'News'}],
        conversations     : [{type: Schema.Types.ObjectId, ref: 'Conversation'}],
        viewBy            : [{type: Schema.Types.ObjectId, ref: 'User'}],
        level             : {type: Number, default: 1},
        featureDetails    : [{
                name: String,
                description: String,
                price: String,
                dateOfExpiration  : Date,
        }],
        verified          : {type: Boolean, default: false},
        onesignalTokens: [{type: String}],
        notificationTokens: [{type: String}],
        connections       : [{
                user        : {type: Schema.Types.ObjectId, ref: 'User'},
                relationship: {type: String, enum: ['requested', 'received', 'connected']},
                isForced    : {type: Boolean, default: false} // contacts sync or by search and send request
        }],
        declinedRequests  : [String],
        jobs              : [{type: Schema.Types.ObjectId, ref: 'Job'}],
        favoritedJobs     : [{type: Schema.Types.ObjectId, ref: 'Job'}],
        sharedJobs        : [{type: Schema.Types.ObjectId, ref: 'Job'}],
        viewedJobs        : [{type: Schema.Types.ObjectId, ref: 'Job'}],
        clonedJobs        : [{type: Schema.Types.ObjectId, ref: 'Job'}],
        favoritedItems    : [{type: Schema.Types.ObjectId, ref: 'Item'}],
        sharedItems       : [{type: Schema.Types.ObjectId, ref: 'Item'}],
        viewedItems       : [{type: Schema.Types.ObjectId, ref: 'Item'}],
        actions           : [{type: Schema.Types.ObjectId, ref: 'Action'}],
        incentives        : [{type: Schema.Types.ObjectId, ref: 'Incentive'}],
        contacts          : [String],
        synced            : {type: Boolean, default: false},

});

exports.User = mongoose.model('User', UserSchema);

exports.Verification = mongoose.model('Verification', new Schema({
        user   : {type: Schema.Types.ObjectId, ref: 'User'},
        phone  : String,
        code   : String,
        active : Boolean,
        created: {type: Date, default: Date.now()}
}));

exports.Forgot = mongoose.model('Forgot', new Schema({
        phone : String,
        code  : String,
        active: Boolean
}));

exports.SysMessage = mongoose.model('SysMessage', new Schema({
        msgKey : String,
        msgValue  : String
}));

exports.Skill = mongoose.model('Skill', new Schema({
        name: String
}));

exports.Category = mongoose.model('Category', new Schema({
        name       : String,
        subCategory: [{name: String}]
}));



exports.Industry = mongoose.model('Industry', new Schema({
        name       : String,
        subIndustry: [{name: String}]
}));


let JobSchema =  new Schema({
        user       : {type: Schema.Types.ObjectId, ref: 'User'},
        company    : String,
        jobTitle   : String,
        isCurated  : Boolean,
        industry   : {
                industry   : String,
                subIndustry: String
        },
        skills     : [String],
        type       : {type: String, enum: ['full-time', 'contract', 'part-time', 'internship', 'freelance']},
        description: String,
        salary     : String,
        salaryType : String,
        contactName: String,
        contact    : String,
        zip        : String,
        city       : {type: String, default: 'Unknown'},
        country    : String,
        created    : {type: Date, default: new Date()},
        expirationDate: {type: Date, default: function(){let exp = new Date(); exp.setDate(exp.getDate() + 55); return(exp)}},
        favoritedBy: [String],
        sharedBy   : [{type: Schema.Types.ObjectId, ref: 'User'}],
        clonedBy   : [{type: Schema.Types.ObjectId, ref: 'User'}],
        appliedBy  : [{type: Schema.Types.ObjectId, ref: 'User'}],
        viewedBy   : [{type: Schema.Types.ObjectId, ref: 'User'}],
        spam       : false,
        joltedBy   : [String]

});

function findNotFlaggedMiddleware(next) {
    this.where('spam').equals(false);
    next();
}

JobSchema.pre('find', findNotFlaggedMiddleware);
JobSchema.pre('findOne', findNotFlaggedMiddleware);



exports.Job = mongoose.model('Job', JobSchema);

let ItemSchema = new Schema({
        user       : {type: Schema.Types.ObjectId, ref: 'User'},
        name       : String,
        photos     : [String],
        description: String,
        price      : String,
        category   : {type: Schema.Types.ObjectId, ref: 'Category'},
        zip        : String,
        city       : {type: String, default: 'Unknown'},
        country    : String,
        created    : {type: Date, default: Date.now()},
        favoritedBy: [String],
        sharedBy   : [{type: Schema.Types.ObjectId, ref: 'User'}],
        viewedBy   : [{type: Schema.Types.ObjectId, ref: 'User'}],
        joltedBy   : [String],
        spam       : false,
        offeredBy  : [String]
});

function findNotFlaggedMiddleware(next) {
    this.where('spam').equals(false);
    next();
}

ItemSchema.pre('find', findNotFlaggedMiddleware);
ItemSchema.pre('findOne', findNotFlaggedMiddleware);

exports.Item = mongoose.model('Item', ItemSchema);


exports.Conversation = mongoose.model('Conversation', new Schema({
        participants: [{type: Schema.Types.ObjectId, ref: 'User'}],
        messages    : [{type: Schema.Types.ObjectId, ref: 'Message'}],
        date        : {type: Date, default: Date.now()}
}));

exports.Message = mongoose.model('Message', new Schema({
        conversation: {type: Schema.Types.ObjectId, ref: 'Conversation'},
        sender      : {type: Schema.Types.ObjectId, ref: 'User'},
        content     : String,
        created     : {type: Date, default: Date.now()}
}));

exports.Blog = mongoose.model('Blog', new Schema({
        poster : {type: Schema.Types.ObjectId, ref: 'User'},
        title  : String,
        content: String,
        likes  : [{type: Schema.Types.ObjectId, ref: 'User'}],
        created: {type: Date, default: Date.now()}
}));

exports.News = mongoose.model('News', new Schema({
        poster : {type: Schema.Types.ObjectId, ref: 'User'},
        title  : String,
        content: String,
        likes  : [{type: Schema.Types.ObjectId, ref: 'User'}],
        created: {type: Date, default: Date.now()}
}));

exports.Incentive = mongoose.model('Incentive', new Schema({
        goal   : Number,
        reward : String,
        actions: [{type: Schema.Types.ObjectId, ref: 'Action'}]
}));

exports.Action = mongoose.model('Action', new Schema({
        reward     : Number,
        type: String,
        description: String,
        incentive  : {$type: Schema.Types.ObjectId, ref: 'Incentive'}
}, { typeKey: '$type' }));

exports.Redeemed = mongoose.model('Redeemed', new Schema({
        user  : {type: Schema.Types.ObjectId, ref: 'User'},
        reward: {type: Schema.Types.ObjectId, ref: 'Incentive'}
}));

exports.PendingRequest = mongoose.model('PendingRequest', new Schema({
        senderPhone  : String,
        receiverPhone: String,
        senderId     : String
}));
exports.Transaction = mongoose.model('Transaction', new Schema({
        history: [{type: String, tokens: Number, date: Date}],
        userId     : String
}, { typeKey: '$type' }));
exports.Question = mongoose.model('Question', new Schema({
        ask     : String,
        order   : Number,
        duration: Number
}));

exports.Timeline = mongoose.model('Timeline', new Schema({
        question : {type: Schema.Types.ObjectId, ref: 'Question'},
        timeStart: String,
        timeEnd  : String
}));

exports.Video = mongoose.model('Video', new Schema({
        url          : String,
        size         : Number,
        name         : String,
        answers      : [{type: Schema.Types.ObjectId, ref: 'Timeline'}],
        user         : {type: Schema.Types.ObjectId, ref: 'User'}
}));

exports.Ranks = mongoose.model('Ranks', new Schema({
        rank: String,
        usdWorth: String,
        joltWorth: String,
        desc: String
}));

exports.Configuration = mongoose.model('Configuration', new Schema({
        name: String,
        value: Object,
        desc: String
}));

exports.RecruiterBank = mongoose.model('RecruiterBank', new Schema({
        user         : {type: Schema.Types.ObjectId, ref: 'User'},
        recruiterRank: String,
        joltsEarned: [{
                fromUser: {type: Schema.Types.ObjectId, ref: 'User'},
                currentRank: String,
                jolts: String,
                timestamp: {type: Date, default: Date.now()}
        }],
        skrillForm: {
                name: String,
                email: String
        },
        ratings: [{
                fromUser         : {type: Schema.Types.ObjectId, ref: 'User'},
                communication: Number,
                productivity: Number,
                professionalism: Number,
                quality: Number,
                experience: Number,
                date: {type: Date, default: Date.now()}
        }],
        joltsClaimed: [{
                amount: String,
                status: { type: String, enum: ['processing', 'unprocessed', 'in-process', 'error-contact']},
                date: {type: Date, default: Date.now()}
        }],
}));


