# how to install

## one command

```
npx @jitera/connect login --install
```

Signs you in through your browser, creates an api key, and configures every
assistant it finds. Detected independently: claude code, cursor, codex.

For a pilot or staging environment:

```
npx @jitera/connect login --env=studio-05 --install
```

## claude code

```
/plugin marketplace add jitera-product/connect
/plugin install jitera-connect
```

## codex

```
codex plugin marketplace add jitera-product/connect
```

## cursor

```
npx @jitera/connect
```

## pilot and staging environments

claude code, at install:

```
/plugin install jitera-connect --config environment=studio-05
```

claude code, after installing:

```
/plugin configure jitera-connect
```

cursor and codex:

```
npx @jitera/connect --env=studio-05
npx @jitera/connect --env=studio-stage
```

## the api key

`login --install` puts the key in your os keychain for claude code. cursor and
codex read it from the environment, so export it:

```
export JITERA_API_KEY=<the key login printed>
```
