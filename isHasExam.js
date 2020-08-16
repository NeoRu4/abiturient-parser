const fs = require("fs");
const request = require("request");
const cheerio = require("cheerio");
const { Observable, of } = require('rxjs');
const { map, mergeMap } = require('rxjs/operators');
const {DataFrame} = require('dataframe-js');

require('events').EventEmitter.defaultMaxListeners = 100

const mainUrl = "https://magister.urfu.ru"

function requestServer(url) {

    return new Observable(observer => {

        request.get({ url: url }, function (error, response, body) {

            response.encoding = 'utf-8'
            if (error || response.statusCode != 200) {
                observer.error(error);
                return;
            }

            observer.next(response);
            observer.complete();

        }).on('error', (error) => {
            console.error(error);
            observer.error(error);
        })
    })
}

function isNumeric(value) {
    return /^-{0,1}\d+$/.test(value);
}

function isGirl(name) {
  name = name.split(' ')
  isGrl = name[0].endsWith('а') || name[0].endsWith('ая') || (name[2] && name[2].endsWith('а'))
  return isGrl
}

var cashed
var lastTimeStamp = ""

function getRatingRtf(departamentId, highlightIds) {
    return requestServer(`${mainUrl}/api/ratings/departmental/19/7/1/`).pipe(
        mergeMap(response => {

            api = JSON.parse(response.body);
            // console.log(api)

            if (lastTimeStamp == api.tstamp || !api.tstamp) {
                return of(null)
            }

            lastTimeStamp = api.tstamp

            return requestServer(`${mainUrl}${api.url}`);
        }),
        map(response => {

            if (response == null) {
                return cashed
            }

            var body
            var $ = cheerio.load(response.body)

            var cheerioTable = cheerio.load('<div></div>')('div')
            departamentId.forEach(block => {
                createTableDom($, cheerioTable, block, highlightIds)
            });

            body = cheerioTable.html()

            cashed = {body: body, lastTimeStamp: lastTimeStamp}
            return cashed
        })
    );
}

exports.getRatingRtf = getRatingRtf

function createTableDom($, cheerioTable, block, highlightIds) {

    const title = $(`table#${block} tbody tr b`).toArray().map(val => $(val).text())

    cheerioTable.append( `<h2>${title[0]}</h2><h3>${title[1]}</h3>` )

    const currentTable = $(`table#${block}+ table + div + table`)

    const greensCount = currentTable.find('.rating_mc').length

    const tableTr = currentTable.find('tr')

    $($(tableTr[0]).children('th')[4]).text('Процент в списке')

    tableTr.filter(indx => {
        const td = $(tableTr[indx]).children('td')
        return highlightIds.includes($(td[1]).text().trim());
    }).addClass('blue');

    const rating = currentTable.find('tr.rating_mc')
    rating.each(indx => {
        const tds = $(rating[indx]).children('td')
        const percent = (100 * ((indx + 1) / greensCount)).toFixed(2)
        $(tds[4]).text(percent + '%')
    })
    cheerioTable.append(currentTable)

    const listName = tableTr.toArray().map(x => $($(x).children('td')[0]).text())
    const listSex = tableTr.toArray().map(x => {
        const girl = isGirl($($(x).children('td')[0]).text())
        return (girl ? 'woman' : 'man')
    })
    const listId = tableTr.toArray().map(x => $($(x).children('td')[1]).text())
    const listPetition = tableTr.toArray().map(x => $($(x).children('td')[2]).text())
    const listGreen = tableTr.toArray().map(x => $(x).is('.rating_mc'))
    const listScore = tableTr.toArray().map(x => parseInt($($(x).children('td')[5]).text()))
    const df = createDataFrame(listName, listSex, listId, listPetition, listGreen, listScore)

    var countDf = df.groupBy('sex', 'green').aggregate(group => group.count()).rename('aggregation', 'count')
    var meanDf = df.groupBy('sex', 'green').aggregate(group => group.stat.mean('score').toFixed(2)).rename('aggregation', 'mean')
    var stdDf = df.groupBy('sex', 'green').aggregate(group => group.stat.sd('score').toFixed(2)).rename('aggregation', 'std')

    var joinDf = countDf.fullJoin(meanDf,['sex','green'])
                        .fullJoin(stdDf,['sex','green'])
    cheerioTable.append(
        createAggrigationDiv(
            joinDf.toCollection(),
            {
                petition:'Зелёный',
                sex: 'Пол',
                count: 'Кол-во',
                mean: 'Средний балл',
                std: 'Среднеквадратичное отклонение'
            })
    )

}

function createDataFrame(name, sex, id, petition, green, score) {
    return new DataFrame({
        name: name,
        sex: sex,
        id: id,
        petition: petition,
        green: green,
        score: score
    }, ['name', 'sex', 'id', 'petition', 'green', 'score']).slice(1);
}

function createAggrigationDiv(dfCollection, titles) {
    var table = ''
    dfCollection.splice(0,0, titles)
    dfCollection.forEach(value => {
        table +=
         `<div class="row">
            <div class="col">${value.petition || value.green}</div>
            <div class="col">${value.sex}</div>
            <div class="col">${value.count}</div>
            <div class="col">${value.mean}</div>
            <div class="col">${value.std}</div>
        </div>`
    })
    return `<div class="aggrigate">
                ${table}
            </div>`
}