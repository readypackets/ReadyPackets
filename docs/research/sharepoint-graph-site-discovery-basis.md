# Microsoft Graph SharePoint Site Discovery — Implementation Basis

## Official sources

1. [Get a site resource by path — Microsoft Graph v1.0](https://learn.microsoft.com/en-us/graph/api/site-getbypath?view=graph-rest-1.0)
2. [Get a site resource — Microsoft Graph v1.0](https://learn.microsoft.com/en-us/graph/api/site-get?view=graph-rest-1.0)
3. [site resource type — Microsoft Graph v1.0](https://learn.microsoft.com/en-us/graph/api/resources/site?view=graph-rest-1.0)

## Confirmed behavior

Microsoft Graph supports discovery by the SharePoint hostname plus a server-relative path using:

```text
GET /sites/{hostname}:/{relative-path}
```

For a tenant root site, Graph supports `GET /sites/root` and `GET /sites/{hostname}`. A SharePoint tenant-root URL such as `https://contoso.sharepoint.com/` must therefore be canonicalized and resolved with the hostname-root endpoint rather than a path query that is intended for a non-root site.

The least-privilege Microsoft Graph application permission for reading a site is `Sites.Read.All`; write operations require `Sites.ReadWrite.All`. ReadyPackets discovery requires the least privilege necessary to resolve the site and enumerate document libraries. The configured application must be granted tenant admin consent before discovery can succeed.

## ReadyPackets implementation constraints

The browser must send a site URL and never receive the client secret. Server code uses the secret only to request a Graph token, never logs it, and returns only the discovered Graph site ID and document-library metadata. URL normalization must accept a valid `https://*.sharepoint.com` tenant-root or site URL, remove copied query/hash fragments, reject credentials/ports/non-HTTPS hosts, and use the appropriate root or path Graph endpoint.
