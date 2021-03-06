/* eslint-disable */
'use strict';

const Service = require('egg').Service;

class PvuvivService extends Service {

    // 保存用户上报的数据
    async getPvUvIpData(appId, beginTime, endTime) {
        const querydata = { app_id: appId, type: 1, create_time: { $gte: new Date(beginTime), $lt: new Date(endTime) } };
        const datas = await this.ctx.model.Wx.WxPvuvip.find(querydata).read('sp').exec();
        return datas;
    }
    // 查询某日概况
    async getPvUvIpSurveyOne(appId, beginTime, endTime) {
        const query = { app_id: appId, type: 2, create_time: { $gte: new Date(beginTime), $lte: new Date(endTime) } };
        const data = await this.ctx.model.Wx.WxPvuvip.findOne(query).read('sp').exec();
        if (data) return data;
        // 不存在则储存
        const pvuvipdata = await this.getPvUvIpSurvey(appId, beginTime, endTime, true);
        const result = await this.savePvUvIpData(appId, beginTime, 2, pvuvipdata);
        return result;
    }
    // 历史概况
    async getHistoryPvUvIplist(appId) {
        const query = { app_id: appId, type: 2 };
        return await this.ctx.model.Wx.WxPvuvip.find(query)
            .read('sp')
            .sort({ create_time: -1 })
            .limit(5)
            .exec();
    }
    // 概况统计
    async getPvUvIpSurvey(appId, beginTime, endTime, type) {
        const querydata = { create_time: { $gte: new Date(beginTime), $lt: new Date(endTime) } };
        const pv = Promise.resolve(this.pv(appId, querydata));
        const uv = Promise.resolve(this.uv(appId, querydata));
        const ip = Promise.resolve(this.ip(appId, querydata));
        const ajax = Promise.resolve(this.ajax(appId, querydata));

        if (!type) {
            const data1 = await Promise.all([ pv, uv, ip, ajax ]);
            return {
                pv: data1[0],
                uv: data1[1][0].count,
                ip: data1[2][0].count,
                ajax: data1[3],
            };
        } else {
            const user = Promise.resolve(this.user(appId, querydata));
            const bounce = Promise.resolve(this.bounce(appId, querydata));
            const data2 = await Promise.all([ pv, uv, ip, ajax, user, bounce]);
            return {
                pv: data2[0] || 0,
                uv: data2[1][0].count || 0,
                ip: data2[2][0].count || 0,
                ajax: data2[3],
                user: data2[4][0].count || 0,
                bounce: data2[5] || 0,
            };
        }
    }
    // pv
    async pv(appId, querydata){
        return this.app.models.WxPages(appId).count(querydata).read('sp').exec();
    }
    // ajax
    async ajax(appId, querydata) {
        return this.app.models.WxAjaxs(appId).count(querydata).read('sp').exec();
    }
    // uv
    async uv(appId, querydata){
        return this.app.models.WxPages(appId).aggregate([
            { $match: querydata, },
            { $project: { "mark_uv": true } },
            { $group: { _id: "$mark_uv" } },
            { $group: { _id: null, count: { $sum: 1 } } }
        ]).read('sp').exec();
    }
    // ip
    async ip(appId, querydata){
        return this.app.models.WxPages(appId).aggregate([
            { $match: querydata, },
            { $project: { "ip": true } },
            { $group: { _id: "$ip" } },
            { $group: { _id: null, count: { $sum: 1 } } }
        ]).read('sp').exec();
    }
    // user
    async user(appId, querydata){
        return this.app.models.WxPages(appId).aggregate([
            { $match: querydata, },
            { $project: { "mark_user": true } },
            { $group: { _id: "$mark_user" } },
            { $group: { _id: null, count: { $sum: 1 } } }
        ]).read('sp').exec();
    }
    // 跳出率
    async bounce(appId, querydata) {
        const option = {
            map: function () { emit(this.mark_user, 1); },
            reduce: function (key, values) { return values.length == 1 },
            query: querydata,
            keeptemp: false,
            out: { replace: 'wxjumpout' },
        }
        const res = await this.app.models.WxPages(appId).mapReduce(option)
        const result = await res.model.find().where('value').equals(1).count().exec();
        return result;
    }
    // 保存pvuvip数据
    async savePvUvIpData(appId, endTime, type, pvuvipdata) {
        const pvuvip = this.ctx.model.Wx.WxPvuvip();
        pvuvip.app_id = appId;
        pvuvip.pv = pvuvipdata.pv || 0;
        pvuvip.uv = pvuvipdata.uv || 0;
        pvuvip.ip = pvuvipdata.ip || 0;
        pvuvip.ajax = pvuvipdata.ajax || 0;
        pvuvip.bounce = pvuvipdata.bounce ? (pvuvipdata.bounce / pvuvipdata.pv * 100).toFixed(2) + '%' : 0;
        pvuvip.depth = pvuvipdata.pv && pvuvipdata.user ? parseInt(pvuvipdata.pv / pvuvipdata.user) : 0;
        pvuvip.create_time = endTime;
        pvuvip.type = type;

        return await pvuvip.save();
    }
}

module.exports = PvuvivService;
