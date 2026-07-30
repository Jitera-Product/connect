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

cursor:

```
npx @jitera/connect --env=studio-05
npx @jitera/connect --env=studio-stage
```

claude code, at install:

```
/plugin install jitera-connect --config jitera_mcp_url=https://kong-proxy-pilot.jitera.app/gateway/boost-05/mcp
```

claude code, after installing:

```
/plugin configure jitera-connect
```

endpoints:

```
production     https://gateway-proxy.jitera.app/gateway/boost/mcp
studio-stage   https://jitera-stage-pilot.jitera.app/gateway/boost/mcp
studio-NN      https://kong-proxy-pilot.jitera.app/gateway/boost-NN/mcp
```
