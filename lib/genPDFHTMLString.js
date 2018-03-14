module.exports = (obj) => {
  return `<html>
  <head>
    <meta http-equiv=Content-Type content="text/html; charset=UTF-8"/>
    <link href="https://fonts.googleapis.com/css?family=Roboto" rel="stylesheet">
    <style type="text/css">
    <!--
    div.bg { background: url("` + __dirname + '/assets/bg.jpg' + `") no-repeat; background-size: contain;}
    table.right { width: auto;margin-right: 40px;margin-left: auto;}
    td.cls_002{font-family:"Roboto", Arial, Helvetica, sans-serif;font-size:38px;color:rgb(43,42,41);font-weight:normal;font-style:normal;text-decoration: none}
    td.cls_003{font-family:"Roboto", Arial, Helvetica, sans-serif;font-size:12px;color:rgb(43,42,41);font-weight:normal;font-style:normal;text-decoration: none}
    td.cls_004{font-family:"Roboto", Arial, Helvetica, sans-serif;font-size:13px;color:rgb(43,42,41);font-weight:bold;font-style:normal;text-decoration: none}
    span.cls_004{font-family:"Roboto", Arial, Helvetica, sans-serif;font-size:13px;color:rgb(43,42,41);font-weight:bold;font-style:normal;text-decoration: none}
    td.cls_005{font-family:"Roboto", Arial, Helvetica, sans-serif,serif;font-size:12px;color:rgb(43,42,41);font-weight:normal;font-style:normal;text-decoration: none}
    td.cls_008{font-family:"Roboto", Arial, Helvetica, sans-serif,serif;font-size:24px;color:rgb(43,42,41);font-weight:bold;font-style:normal;text-decoration: none}
    -->
    </style>
  </head>
  <body style="margin: 0; padding: 0;">
    <div class="bg" style="position:absolute;left:50%;margin-left:-309px;top:0px;width:620px;height:877px;overflow:hidden;">
      <table style="width: 100%;">
        <tr>
          <td>
          <table class="right">
            <tr>
              <td class="cls_002">Certificaat</td>
            </tr>
            <tr>
              <td class="cls_003">J. de Jonge Lease B.V.</td>
            </tr>
            <tr>
              <td class="cls_003">Kon. Wilhelminahaven ZZ 18</td>
            </tr>
            <tr>
              <td class="cls_003">3134 KG Vlaardingen</td>
            </tr>
            <tr>
              <td class="cls_003">The Netherlands</td>
            </tr>
            <tr>
              <td class="cls_003">T &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; +31 10 248 58 30</td>
            </tr>
            <tr>
              <td class="cls_003">E &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; logistiek@jdejonge.nl</td>
            </tr>
            <tr>
              <td class="cls_003">W &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;www.jdejonge.nl</td>
            </tr>
          </table>
          </td>
        </tr>

        <tr>
          <td>
            <table style="width:100%;">
              <tr>
                <td class="cls_002">&nbsp;</td>
                <td class="cls_002">&nbsp;</td>
                <td class="cls_002">&nbsp;</td>
              </tr>
              <tr>
                <td colspan="2">
                  <table style="width:200px; padding-left: 30px;">
                    <tr>
                      <td class="cls_004">Klantgegevens:</td>
                    </tr>
                    <tr>
                      <td class="cls_004">&nbsp;</td>
                    </tr>
                    <tr>
                      <td class="cls_005">` + obj.customerName + `</td>
                    </tr>
                    <tr>
                      <td class="cls_005">` + obj.customerAddress1 + ` ` + obj.customerAddress2 + `</td>
                    </tr>
                    <tr>
                      <td class="cls_005">` + obj.customerPostcode + ` ` + obj.customerAddress3 + `</td>
                    </tr>
                    <tr>
                      <td class="cls_004">&nbsp;</td>
                    </tr>
                    <tr>
                      <td class="cls_005">&nbsp;</td>
                    </tr>
                    <tr>
                      <td class="cls_005">&nbsp;</td>
                    </tr>
                  </table>
                </td>
                <td>
                  <table>
                    <tr>
                      <td class="cls_004">Keurmeester:</td>
                    </tr>
                    <tr>
                      <td class="cls_004">&nbsp;</td>
                    </tr>
                    <tr>
                      <td class="cls_005">Naam: ` + obj.testedWith + `</td>
                    </tr>
                    <tr>
                      <td class="cls_005">` + obj.PATModel + ` ` + obj.PATSerialnumber + `</td>
                    </tr>
                    <tr>
                      <td class="cls_004">&nbsp;</td>
                    </tr>
                    <tr>
                      <td class="cls_005"><span class="cls_004">Uitkomst test:</span> ` + obj.testStatus + `</td>
                    </tr>
                    <tr>
                      <td class="cls_005"><span class="cls_004">Gekeurd op:</span> ` + obj.testDate + `, ` + obj.testTime + `</td>
                    </tr>
                    <tr>
                      <td class="cls_005"><span class="cls_004">Geldig tot:</span> : ` + obj.validUntil + `</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td>
            <table style="width: 100%; padding-left: 30px;">
              <tr>
                <td class="cls_004">&nbsp;</td>
                <td></td>
              </tr>
              <tr>
                <td class="cls_008">Artikelnummer: ` + obj.articleNumber + `</td>
                <td></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td>
            <table style="width: 100%; padding-left: 30px;">
              <tr>
                <td class="cls_004">` + obj.articleDescription + `</td>
                <td></td>
              </tr>
              <tr>
                <td class="cls_004">&nbsp;</td>
                <td></td>
              </tr>
              <tr>
                <td class="cls_004">Testwaardes</td>
                <td></td>
              </tr>
              <tr>
                <td class="cls_004">&nbsp;</td>
                <td></td>
              </tr>
              <tr>
                <td class="cls_004">Testgroep code</td>
                <td class="cls_005">` + obj.testGroup + `</td>
              </tr>
              <tr>
                <td class="cls_004">&nbsp;</td>
                <td class="cls_005">` + obj.testGroupDescription + `</td>
              </tr>
              <tr>
                <td class="cls_004">Testgroep spanning</td>
                <td class="cls_005">` + obj.testGroupVoltage + `</td>
              </tr>
              <tr>
                <td class="cls_004">&nbsp;</td>
                <td></td>
              </tr>
              <tr>
                <td class="cls_004">Test #1</td>
                <td class="cls_005">` + obj.test1 + `</td>
              </tr>
              <tr>
                <td class="cls_004">Test #2</td>
                <td class="cls_005">` + obj.test2 + `</td>
              </tr>
              <tr>
                <td class="cls_004">Test #3</td>
                <td class="cls_005">` + obj.test3 + `</td>
              </tr>
              <tr>
                <td class="cls_004">Test #4</td>
                <td class="cls_005">` + obj.test4 + `</td>
              </tr>
              <tr>
                <td class="cls_004">Test #5</td>
                <td class="cls_005">` + obj.test5 + `</td>
              </tr>
              <tr>
                <td class="cls_004">Test #6</td>
                <td class="cls_005">` + obj.test6 + `</td>
              </tr>
              <tr>
                <td class="cls_004">Test #7</td>
                <td class="cls_005">` + obj.test7 + `</td>
              </tr>
              <tr>
                <td class="cls_004">Test #8</td>
                <td class="cls_005">` + obj.test8 + `</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  </body>
  </html>`;
}
