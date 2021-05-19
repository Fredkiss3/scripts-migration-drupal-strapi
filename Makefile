fetch:
	rm -r output/ && mkdir output && node --trace-warnings parser.js downloaded output  

export:
	node  --trace-warnings exporter.js  output  