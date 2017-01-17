var restify = require('restify');
var bunyan = require('bunyan');
var util = require("util");

var config = require('./param.json');

var logger = bunyan.createLogger({
    name: "mantisbt-sync-jira"
});

var server = restify.createServer({
    name: "mantisbt-sync-jira",
    log: logger
});

var mantisClient = restify.createJsonClient({
    url: config.source.url,
    version: '*',
    log: logger
});

if (config.source.username) {
    mantisClient.basicAuth(config.source.username, config.source.password);
}

var jiraClient = restify.createJsonClient({
    url: config.target.url,
    version: '*',
    log: logger
});

if (config.target.username) {
    jiraClient.basicAuth(config.target.username, config.target.password);
}

function createSubTasks(parentKey) {
    if (config.subTasks) {
        for (var subtask in config.subTasks) {
            var jiraSubtask = {
                "fields": {
                    "project": {
                        "key": config.target.project.key
                    },
                    "issuetype": {
                        "id": subtask.issueType.id
                    },
                    parent: {
                        "key": parentKey
                    },
                    "summary": subtask.summary,
                    "description": subtask.description,
                    "reporter": config.source.username
                }
            };

            jiraClient.post('/issue', jiraIssue, function (err, req, res, obj) {
                if (err) {
                    logger.error(err);
                }
            });
        }
    }
}

function pushToJira(issue) {

    var jql = util.format('"customfield_10017" ~ "%s"', issue.id);
    var query = {
        "jql": jql,
        "startAt": 0,
        "maxResults": 1,
        "fields": [
            "key"
        ]
    };

    jiraClient.post('/search', query, function (err, req, res, obj) {
        if (err) {
            logger.error(err);
        } else {
            if (!obj.issues || !obj.issues.length) {
                var jiraIssue = {
                    "fields": {
                        "project": {
                            "key": config.target.project.key
                        },
                        "issuetype": {
                            "id": config.convert.issueType.id
                        },
                        "summary": issue.summary,
                        "description": issue.description,
                        "reporter": config.source.username
                    }
                };

                jiraClient.post('/issue', jiraIssue, function (err, req, res, obj) {
                    if (err) {
                        logger.error(err);
                    } else if (obj.key) {
                        createSubTasks(obj.key);
                    }
                });
            }
        }
    });
}

// Function to fetch all active issues in Mantis
function getSourceIssues() {

    var uri = util.format('/bugs/search/findByProjectIdAndStatusIdNotIn?project=%s&status=%d',
        config.source.project.id, 90);

    mantisClient.get(uri, function (err, req, res, obj) {
        if (err) {
            logger.error(err);
        } else {
            var issues = obj._embedded.bugs;
            for (var issue in issues) {
                pushToJira(issue);
            }
        }
    });
}


server.get('/launch/:projectId', function create(req, res, next) {
    logger.info("Staring sync for project %s", req.params.projectId);
    getSourceIssues();
    res.send(200);
    return next();
});

server.listen(8080, function () {
    console.log('%s listening at %s', server.name, server.url);
});