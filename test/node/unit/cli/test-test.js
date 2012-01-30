var helper = require("../../test-helper");
var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var testCli = helper.require("cli/test");
var run = helper.runTest;
var nodeRunner = helper.require("cli/runners/node-runner");
var browserRunner = helper.require("cli/runners/browser-runner");

buster.testCase("Test cli", {
    setUp: helper.cliTestSetUp(testCli),
    tearDown: helper.clientTearDown,

    "help": {
        "haves helpTopics property with reporters": function () {
            assert("helpTopics" in this.cli);
            assert.defined(this.cli.helpTopics.reporters);
        }
    },

    "configuration": {
        "fails if config does not exist": run(["-c", "file.js"], function () {
            assert.match(this.stderr, "-c/--config: file.js is not a file");
        }),

        "fails if config is a directory": function (done) {
            helper.mkdir("buster");

            this.cli.run(["-c", "buster"], done(function () {
                assert.match(this.stderr, "-c/--config: buster is not a file");
            }.bind(this)));
        },

        "fails if default config does not exist": run([], function () {
            assert.match(this.stderr, "-c/--config not provided, and none of\n" +
                         "[buster.js, test/buster.js, spec/buster.js] exists");
        }),

        "fails if config contains errors": function (done) {
            helper.writeFile("buster2.js", "modul.exports");

            helper.run(this, ["-c", "buster2.js"], done(function () {
                assert.match(this.stderr, "Error loading configuration buster2.js");
                assert.match(this.stderr, "modul is not defined");
                assert.match(this.stderr, /\d+:\d+/);
            }));
        }
    },

    "explicit environment": {
        setUp: function () {
            helper.writeFile("buster-buggy.js", "var config = module.exports;" +
                             "config.server = { environment: 'phonegap' }");
        },

        "fails when environment does not exist": function (done) {
            helper.run(this, ["-c", "buster-buggy.js", "-e", "phonegap"], done(function () {
                assert.match(this.stderr, "Unknown environment 'phonegap'. Try one of");
                assert.match(this.stderr, "node");
                assert.match(this.stderr, "browser");
            }));
        }
    },

    "node runs": {
        setUp: function () {
            helper.writeFile("buster.js", "var config = module.exports;" +
                             "config.server = { environment: 'node' }");
            this.stub(nodeRunner, "run");
        },

        "loads node runner": function (done) {
            helper.run(this, [], done(function () {
                assert.calledOnce(nodeRunner.run);
                refute.equals(nodeRunner.run.thisValues[0], nodeRunner);
            }));
        },

        "provides runner with logger": function (done) {
            helper.run(this, [], done(function () {
                assert.equals(this.cli.logger, nodeRunner.run.thisValues[0].logger);
            }));
        },

        "runs runner with config and options": function (done) {
            helper.run(this, [], done(function () {
                assert.match(nodeRunner.run.args[0][1], { reporter: "dots" });
                assert.equals(nodeRunner.run.args[0][0].environment, "node");
            }));
        },

        "transfers filters to node runner": function (done) {
            helper.run(this, ["should-"], done(function () {
                assert.equals(nodeRunner.run.args[0][1].filters, ["should-"]);
            }));
        },

        "fails if reporter does not exist": function (done) {
            helper.run(this, ["-r", "bogus"], done(function () {
                assert.match(this.stderr, "No such reporter 'bogus'");
            }));
        }
    },

    "browser runs": {
        setUp: function () {
            this.config = helper.writeFile(
                "buster2.js", "var config = module.exports;" +
                    "config.server = { environment: 'browser' }");

            this.stub(browserRunner, "run");
        },

        "loads browser runner": function (done) {
            helper.run(this, ["-c", this.config], done(function () {
                assert.calledOnce(browserRunner.run);
                refute.equals(browserRunner.run.thisValues[0], browserRunner);
            }));
        },

        "loads browser with server setting": function (done) {
            helper.run(this, ["-c", this.config], done(function () {
                assert.match(browserRunner.run.args[0][1], {
                    server: "http://localhost:1111"
                });
            }));
        },

        "loads browser with specific server setting": function (done) {
            helper.run(this, ["-c", this.config, "-s", "127.0.0.1:1234"], done(function () {
                assert.match(browserRunner.run.args[0][1], {
                    server: "http://127.0.0.1:1234"
                });
            }));
        },

        "allows hostnameless server config": function (done) {
            helper.run(this, ["-c", this.config, "--server", ":5678"], done(function () {
                assert.match(browserRunner.run.args[0][1], {
                    server: "http://127.0.0.1:5678"
                });
            }));
        },

        "allows full server url, including protocol": function (done) {
            helper.run(this, ["-c", this.config, "-s", "http://lol:1234"], done(function () {
                assert.match(browserRunner.run.args[0][1], {
                    server: "http://lol:1234"
                });
            }));
        },

        "skips caching": function (done) {
            helper.run(this, ["-R", "-c", this.config], done(function () {
                assert.calledOnce(browserRunner.run);
                assert.match(browserRunner.run.args[0][1], {
                    cacheResources: false
                });
            }));
        },

        "transfers filters": function (done) {
            helper.run(this, ["-c", this.config, "//should-"], done(function () {
                assert.equals(browserRunner.run.args[0][1].filters, ["//should-"]);
            }));
        }
    },

    "configuration": {
        setUp: function () {
            this.run = this.spy();
            this.stub(this.cli, "loadRunner").returns({ run: this.run });
            this.stub(this.cli, "onConfig").yields(null, { groups: [{}] });
            this.busterOptBlank = typeof process.env.BUSTER_TEST_OPT != "string";
            this.busterOpt = process.env.BUSTER_TEST_OPT;
        },

        tearDown: function () {
            process.env.BUSTER_TEST_OPT = this.busterOpt;
            if (this.busterOptBlank) delete process.env.BUSTER_TEST_OPT;
        },

        "adds command-line options set with $BUSTER_TEST_OPT": function (done) {
            process.env.BUSTER_TEST_OPT = "--color dim -r specification";
            helper.run(this, ["-c", this.config], done(function () {
                assert.match(this.run.args[0][1], {
                    color: true,
                    bright: false,
                    reporter: "specification"
                });
            }));
        },

        "processes one group at a time": function () {
            var run = this.spy();
            this.cli.loadRunner.returns({ run: run });
            this.cli.onConfig.yields(null, { groups: [{id: 1}, {id: 2}] });

            this.cli.run();

            assert.calledOnce(run);
        },

        "processes next group when previous is done": function () {
            var run = this.stub();
            this.cli.loadRunner.returns({ run: run });
            this.cli.onConfig.yields(null, { groups: [{id: 1}, {id: 2}] });

            run.yields();
            this.cli.run();

            assert.calledTwice(run);
        }
    },

    "with --color option": {
        setUp: function () {
            this.run = this.spy();
            this.stub(this.cli, "onConfig").yields(null, { groups: [{}] });
            this.stub(this.cli, "loadRunner").returns({ run: this.run });
        },

        "skips ansi escape sequences when set to none": function (done) {
            helper.run(this, ["-c", this.config, "--color", "none"], done(function () {
                var runner = this;
                assert.match(runner.run.args[0][1], {
                    color: false,
                    bright: false
                });
            }));
        }
    }
});
