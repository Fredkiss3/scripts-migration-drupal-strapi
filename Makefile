fetch:
	rm -r output/ && mkdir output && node parser.js downloaded output  

export:
	node exporter.js  output  