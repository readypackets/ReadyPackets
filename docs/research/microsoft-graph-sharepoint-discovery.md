# Microsoft Graph SharePoint Discovery References

Consulted 2026-08-12 for the ReadyPackets SharePoint discovery workflow.

| Capability | Official Microsoft guidance | ReadyPackets implementation use |
|---|---|---|
| Resolve a SharePoint site from its URL | [Get a site resource](https://learn.microsoft.com/en-us/graph/api/site-get?view=graph-rest-1.0) documents `GET /sites/{hostname}:/{server-relative-path}` and lists application permissions `Sites.Read.All` (least privileged) or `Sites.ReadWrite.All`. | The server receives an HTTPS `*.sharepoint.com` URL and resolves its Graph site ID without exposing the client secret. |
| List document libraries | [List available drives](https://learn.microsoft.com/en-us/graph/api/drive-list?view=graph-rest-1.0) documents `GET /sites/{siteId}/drives` and lists application permissions including `Files.Read.All`, `Files.ReadWrite.All`, `Sites.Read.All`, and `Sites.ReadWrite.All`. | The server returns discovered library metadata so an administrator can select a library before saving configuration. |

The customer-facing sync workflow requires a write-capable Graph application permission because it creates folders and uploads order documents. Client credentials are never returned in discovery results or log output.

## Sources

1. https://learn.microsoft.com/en-us/graph/api/site-get?view=graph-rest-1.0
2. https://learn.microsoft.com/en-us/graph/api/drive-list?view=graph-rest-1.0
