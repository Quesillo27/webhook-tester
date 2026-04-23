dev:
	npm run dev

test:
	npm test

build:
	npm install

docker:
	docker build -t webhook-tester .

lint:
	npm test
