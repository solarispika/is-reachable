'use strict';
const dns = require('dns');
const net = require('net');
const arrify = require('arrify');
const got = require('got');
const isPortReachable = require('is-port-reachable');
const pAny = require('p-any');
const pify = require('pify');
const portNumbers = require('port-numbers');
const pTimeout = require('p-timeout');
const prependHttp = require('prepend-http');
const routerIps = require('router-ips');
const URL = require('url-parse');

const checkRedirection = target => {
	return got(target, {rejectUnauthorized: false}).then(res => {
		const url = new URL(res.headers.location || 'x://x');
		return !routerIps.has(url.hostname);
	}).catch(() => false);
};

function isTargetReachable(target) {
	const url = new URL(prependHttp(target));
	url.port = Number(url.port) || portNumbers.getPort(url.protocol.slice(0, -1)).port || 80;

	if (!/^[a-z]+:\/\//.test(target)) {
		const service = portNumbers.getService(url.port);
		url.protocol = ((service && service.name) ? service.name : 'unknown') + ':';
	}

	return getAddress(url.hostname).then(address => {
		if (!address || routerIps.has(address)) {
			return false;
		}

		if (url.protocol === 'http:' || url.protocol === 'https:') {
			return checkRedirection(url.toString());
		}

		return isPortReachable(url.port, {host: address});
	}).catch(() => false);
}

function getAddress(hostname) {
	if (net.isIP(hostname)) {
		return Promise.resolve(hostname);
	}
	return pify(dns.lookup)(hostname);
}

module.exports = (dests, opts) => {
	opts = opts || {};
	opts.timeout = typeof opts.timeout === 'number' ? opts.timeout : 5000;

	const p = pAny(arrify(dests).map(isTargetReachable));
	return pTimeout(p, opts.timeout).catch(() => false);
};
