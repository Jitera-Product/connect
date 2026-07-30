# how to install

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
/plugin install jitera-connect --config environment=studio-04
```

claude code, after installing:

```
/plugin configure jitera-connect
```

cursor:

```
npx @jitera/connect --env=studio-04
npx @jitera/connect --env=studio-stage
```
