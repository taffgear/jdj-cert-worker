module.exports = (obj) => {
  return `<html>
<head><meta http-equiv=Content-Type content="text/html; charset=UTF-8">
<style type="text/css">
<!--
span.cls_002{font-family:"Century",serif;font-size:24.1px;color:rgb(43,42,41);font-weight:normal;font-style:normal;text-decoration: none}
div.cls_002{font-family:"Century",serif;font-size:24.1px;color:rgb(43,42,41);font-weight:normal;font-style:normal;text-decoration: none}
span.cls_003{font-family:"Century",serif;font-size:9.1px;color:rgb(43,42,41);font-weight:normal;font-style:normal;text-decoration: none}
div.cls_003{font-family:"Century",serif;font-size:9.1px;color:rgb(43,42,41);font-weight:normal;font-style:normal;text-decoration: none}
span.cls_004{font-family:"Century",serif;font-size:11.1px;color:rgb(43,42,41);font-weight:bold;font-style:normal;text-decoration: none}
div.cls_004{font-family:"Century",serif;font-size:11.1px;color:rgb(43,42,41);font-weight:bold;font-style:normal;text-decoration: none}
span.cls_005{font-family:"Century",serif;font-size:11.1px;color:rgb(43,42,41);font-weight:normal;font-style:normal;text-decoration: none}
div.cls_005{font-family:"Century",serif;font-size:11.1px;color:rgb(43,42,41);font-weight:normal;font-style:normal;text-decoration: none}
span.cls_006{font-family:"Century",serif;font-size:12.1px;color:rgb(43,42,41);font-weight:bold;font-style:normal;text-decoration: none}
div.cls_006{font-family:"Century",serif;font-size:12.1px;color:rgb(43,42,41);font-weight:bold;font-style:normal;text-decoration: none}
span.cls_007{font-family:"Century",serif;font-size:12.1px;color:rgb(43,42,41);font-weight:normal;font-style:normal;text-decoration: none}
div.cls_007{font-family:"Century",serif;font-size:12.1px;color:rgb(43,42,41);font-weight:normal;font-style:normal;text-decoration: none}
span.cls_008{font-family:"Century",serif;font-size:18.1px;color:rgb(43,42,41);font-weight:bold;font-style:normal;text-decoration: none}
div.cls_008{font-family:"Century",serif;font-size:18.1px;color:rgb(43,42,41);font-weight:bold;font-style:normal;text-decoration: none}
-->
</style>
</head>
<body>
<div style="position:absolute;left:50%;margin-left:-297px;top:0px;width:100%;height:841px;overflow:hidden;">
<div style="position:absolute;left:0px;top:0px">
<img src="` + __dirname + '/assets/background.jpg' + `" width=595 height=841></div>
<div style="position:absolute;left:390.22px;top:29.57px" class="cls_002"><span class="cls_002">Certificaat</span></div>
<div style="position:absolute;left:390.22px;top:64.11px" class="cls_003"><span class="cls_003">J. de Jonge Lease B.V.</span></div>
<div style="position:absolute;left:390.22px;top:74.91px" class="cls_003"><span class="cls_003">Kon. Wilhelminahaven ZZ 18</span></div>
<div style="position:absolute;left:390.22px;top:85.71px" class="cls_003"><span class="cls_003">3134 KG Vlaardingen</span></div>
<div style="position:absolute;left:390.22px;top:96.51px" class="cls_003"><span class="cls_003">The Netherlands</span></div>
<div style="position:absolute;left:390.22px;top:107.31px" class="cls_003"><span class="cls_003">T</span></div>
<div style="position:absolute;left:426.22px;top:107.31px" class="cls_003"><span class="cls_003">+31 10 248 58 30</span></div>
<div style="position:absolute;left:390.22px;top:118.11px" class="cls_003"><span class="cls_003">E</span></div>
<div style="position:absolute;left:426.22px;top:118.11px" class="cls_003"><span class="cls_003">logistiek@jdejonge.nl</span></div>
<div style="position:absolute;left:390.22px;top:128.91px" class="cls_003"><span class="cls_003">W</span></div>
<div style="position:absolute;left:426.22px;top:128.91px" class="cls_003"><span class="cls_003"> </span><A HREF="http://www.jdejonge.nl/">www.jdejonge.nl</A> </div>
<div style="position:absolute;left:33.01px;top:191.10px" class="cls_004"><span class="cls_004">Klantgegevens :</span></div>
<div style="position:absolute;left:324.44px;top:191.10px" class="cls_004"><span class="cls_004">Keurmeester :</span></div>
<div style="position:absolute;left:33.01px;top:217.50px" class="cls_005"><span class="cls_005">` + obj.customerName + `</span></div>
<div style="position:absolute;left:324.44px;top:217.50px" class="cls_005"><span class="cls_005">Naam : ` + obj.testedWith + `</span></div>
<div style="position:absolute;left:33.01px;top:230.70px" class="cls_005"><span class="cls_005">` + obj.customerAddress1 + ` ` + obj.customerAddress2 + `</span></div>
<div style="position:absolute;left:324.44px;top:230.70px" class="cls_005"><span class="cls_005">` + obj.PATModel + ` ` + obj.PATSerialnumber + `</span></div>
<div style="position:absolute;left:33.01px;top:243.90px" class="cls_005"><span class="cls_005">` + obj.customerAddress3 + ` ` + obj.customerPostcode + `</span></div>
<div style="position:absolute;left:324.44px;top:257.10px" class="cls_004"><span class="cls_004">Uitkomst test :</span><span class="cls_005"> ` + obj.testStatus + `</span></div>
<div style="position:absolute;left:324.44px;top:270.30px" class="cls_004"><span class="cls_004">Gekeurd op :</span><span class="cls_005"> ` + obj.testDate + `, ` + obj.testTime + `</span></div>
<div style="position:absolute;left:324.44px;top:283.70px" class="cls_006"><span class="cls_006">Geldig tot : (</span><span class="cls_007">XX-XX-XXXX)</span></div>
<div style="position:absolute;left:33.01px;top:316.40px" class="cls_008"><span class="cls_008">Artikel nummer : ` + obj.articleNumber + `</span></div>
<div style="position:absolute;left:33.01px;top:336.60px" class="cls_004"><span class="cls_004">` + obj.articleDescription + `</span></div>
<div style="position:absolute;left:33.01px;top:363.00px" class="cls_004"><span class="cls_004">Testwaardes</span></div>
<div style="position:absolute;left:33.01px;top:389.40px" class="cls_004"><span class="cls_004">Testgroep code</span></div>
<div style="position:absolute;left:217.69px;top:388.55px" class="cls_005"><span class="cls_005">` + obj.testGroup + `</span></div>
<div style="position:absolute;left:217.69px;top:401.75px" class="cls_005"><span class="cls_005">` + obj.testGroupDescription + `</span></div>
<div style="position:absolute;left:33.01px;top:415.80px" class="cls_004"><span class="cls_004">Testgroep spanning</span></div>
<div style="position:absolute;left:217.69px;top:414.95px" class="cls_005"><span class="cls_005">` + obj.testGroupVoltage + `</span></div>
<div style="position:absolute;left:33.01px;top:442.20px" class="cls_004"><span class="cls_004">Test #1</span></div>
<div style="position:absolute;left:217.69px;top:441.35px" class="cls_005"><span class="cls_005">` + obj.test1 + `</span></div>
<div style="position:absolute;left:33.01px;top:455.40px" class="cls_004"><span class="cls_004">Test #2</span></div>
<div style="position:absolute;left:217.69px;top:454.55px" class="cls_005"><span class="cls_005">` + obj.test2 + `</span></div>
<div style="position:absolute;left:33.01px;top:468.60px" class="cls_004"><span class="cls_004">Test #3</span></div>
<div style="position:absolute;left:217.69px;top:467.75px" class="cls_005"><span class="cls_005">` + obj.test3 + `</span></div>
<div style="position:absolute;left:33.01px;top:481.80px" class="cls_004"><span class="cls_004">Test #4</span></div>
<div style="position:absolute;left:217.69px;top:480.95px" class="cls_005"><span class="cls_005">` + obj.test4 + `</span></div>
<div style="position:absolute;left:33.01px;top:495.00px" class="cls_004"><span class="cls_004">Test #5</span></div>
<div style="position:absolute;left:217.69px;top:494.15px" class="cls_005"><span class="cls_005">` + obj.test5 + `</span></div>
<div style="position:absolute;left:33.01px;top:508.20px" class="cls_004"><span class="cls_004">Test #6</span></div>
<div style="position:absolute;left:217.69px;top:507.35px" class="cls_005"><span class="cls_005">` + obj.test6 + `</span></div>
<div style="position:absolute;left:33.01px;top:521.40px" class="cls_004"><span class="cls_004">Test #7</span></div>
<div style="position:absolute;left:217.69px;top:520.55px" class="cls_005"><span class="cls_005">` + obj.test7 + `</span></div>
<div style="position:absolute;left:33.01px;top:534.60px" class="cls_004"><span class="cls_004">Test #8</span></div>
<div style="position:absolute;left:217.69px;top:533.75px" class="cls_005"><span class="cls_005">` + obj.test8 + `</span></div>
</div>

</body>
</html>
`
}
