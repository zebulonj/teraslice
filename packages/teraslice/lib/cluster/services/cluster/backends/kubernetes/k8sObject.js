'use strict';

const _ = require('lodash');
const { makeTemplate } = require('./utils');

/**
 * Generate the kubernetes worker deployment for a teraslice job worker
 * from the execution (job instance definition) and the config context
 * @param  {[type]} templateType 'deployments' or 'jobs'
 * @param  {[type]} templateName 'worker' or 'execution_controller'
 * @param  {Object} execution    Teraslice Execution object
 * @param  {Object} config       Configuration object with calling context info
 * @return {Object}              Worker Deployment Object
 */
function gen(templateType, templateName, execution, config) {
    const templateGenerator = makeTemplate(templateType, templateName);
    const k8sObject = templateGenerator(config);

    // Apply job `node_labels` setting as k8s nodeAffinity
    // We assume that multiple node_labels require both to match ...
    // NOTE: If you specify multiple `matchExpressions` associated with
    // `nodeSelectorTerms`, then the pod can be scheduled onto a node
    // only if *all* `matchExpressions` can be satisfied.
    if (_.has(execution, 'node_labels')) {
        _setAffinity(k8sObject, execution);
    }

    if (_.has(execution, 'resources')) {
        _setResources(k8sObject, execution);
    }

    if (_.has(execution, 'volumes')) {
        _setVolumes(k8sObject, execution);
    }

    return k8sObject;
}

function _setVolumes(k8sObject, execution) {
    _.forEach(execution.volumes, (volume) => {
        k8sObject.spec.template.spec.volumes.push({
            name: volume.name,
            persistentVolumeClaim: { claimName: volume.name }
        });
        k8sObject.spec.template.spec.containers[0].volumeMounts.push({
            name: volume.name,
            mountPath: volume.path
        });
    });
}

function _setResources(k8sObject, execution) {
    k8sObject.spec.template.spec.resources = {};
    if (_.has(execution.resources, 'minimum')) {
        k8sObject.spec.template.spec.resources.requests = {
            cpu: execution.resources.minimum.cpu,
            memory: execution.resources.minimum.memory
        };
    }

    if (_.has(execution.resources, 'limit')) {
        k8sObject.spec.template.spec.resources.limits = {
            cpu: execution.resources.limit.cpu,
            memory: execution.resources.limit.memory
        };
    }
}

function _setAffinity(k8sObject, execution) {
    k8sObject.spec.template.spec.affinity = {
        nodeAffinity: {
            requiredDuringSchedulingIgnoredDuringExecution: {
                nodeSelectorTerms: [{ matchExpressions: [] }]
            }
        }
    };

    _.forEach(execution.node_labels, (label) => {
        k8sObject.spec.template.spec.affinity.nodeAffinity
            .requiredDuringSchedulingIgnoredDuringExecution
            .nodeSelectorTerms[0].matchExpressions.push({
                key: label.key,
                operator: 'In',
                values: [label.value]
            });
    });
}

exports.gen = gen;
