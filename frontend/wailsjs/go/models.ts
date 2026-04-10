export namespace command {
	
	export class Variable {
	    name: string;
	    default: string;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new Variable(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.default = source["default"];
	        this.description = source["description"];
	    }
	}
	export class Command {
	    id: string;
	    name: string;
	    group: string;
	    description: string;
	    content: string;
	    variables: Variable[];
	    shortcut: string;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Command(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.group = source["group"];
	        this.description = source["description"];
	        this.content = source["content"];
	        this.variables = this.convertValues(source["variables"], Variable);
	        this.shortcut = source["shortcut"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ExecutionRequest {
	    sessionIds: string[];
	    command: string;
	    mode: string;
	    timeoutMs: number;
	    onFailure: string;
	    maxRetries: number;
	
	    static createFrom(source: any = {}) {
	        return new ExecutionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessionIds = source["sessionIds"];
	        this.command = source["command"];
	        this.mode = source["mode"];
	        this.timeoutMs = source["timeoutMs"];
	        this.onFailure = source["onFailure"];
	        this.maxRetries = source["maxRetries"];
	    }
	}
	export class ExecutionResult {
	    sessionId: string;
	    sessionName: string;
	    success: boolean;
	    output: string;
	    error: string;
	    durationMs: number;
	
	    static createFrom(source: any = {}) {
	        return new ExecutionResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessionId = source["sessionId"];
	        this.sessionName = source["sessionName"];
	        this.success = source["success"];
	        this.output = source["output"];
	        this.error = source["error"];
	        this.durationMs = source["durationMs"];
	    }
	}

}

export namespace logger {
	
	export class LogFileInfo {
	    weekDir: string;
	    filename: string;
	    fullPath: string;
	    size: number;
	    // Go type: time
	    modifiedTime: any;
	
	    static createFrom(source: any = {}) {
	        return new LogFileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.weekDir = source["weekDir"];
	        this.filename = source["filename"];
	        this.fullPath = source["fullPath"];
	        this.size = source["size"];
	        this.modifiedTime = this.convertValues(source["modifiedTime"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class BackgroundFileInfo {
	    name: string;
	    size: number;
	    modifiedTime: string;
	
	    static createFrom(source: any = {}) {
	        return new BackgroundFileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.size = source["size"];
	        this.modifiedTime = source["modifiedTime"];
	    }
	}
	export class ImportCommandPreview {
	    id: string;
	    name: string;
	    content: string;
	    isNew: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ImportCommandPreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.content = source["content"];
	        this.isNew = source["isNew"];
	    }
	}
	export class ImportOptions {
	    sessionMode: string;
	    commandMode: string;
	    selectedIds: string[];
	    sessionNewIds: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new ImportOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessionMode = source["sessionMode"];
	        this.commandMode = source["commandMode"];
	        this.selectedIds = source["selectedIds"];
	        this.sessionNewIds = source["sessionNewIds"];
	    }
	}
	export class ImportSessionPreview {
	    id: string;
	    name: string;
	    host: string;
	    protocol: string;
	    isNew: boolean;
	    existsName: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportSessionPreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.protocol = source["protocol"];
	        this.isNew = source["isNew"];
	        this.existsName = source["existsName"];
	    }
	}
	export class ImportPreview {
	    sessions: ImportSessionPreview[];
	    commands: ImportCommandPreview[];
	    totalSessions: number;
	    totalCommands: number;
	    newSessions: number;
	    duplicateCount: number;
	
	    static createFrom(source: any = {}) {
	        return new ImportPreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessions = this.convertValues(source["sessions"], ImportSessionPreview);
	        this.commands = this.convertValues(source["commands"], ImportCommandPreview);
	        this.totalSessions = source["totalSessions"];
	        this.totalCommands = source["totalCommands"];
	        this.newSessions = source["newSessions"];
	        this.duplicateCount = source["duplicateCount"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace session {
	
	export class FlexibleTime {
	
	
	    static createFrom(source: any = {}) {
	        return new FlexibleTime(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	
	    }
	}
	export class Group {
	    id: string;
	    name: string;
	    parentId: string;
	    path: string;
	    createdAt: FlexibleTime;
	    updatedAt: FlexibleTime;
	
	    static createFrom(source: any = {}) {
	        return new Group(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.parentId = source["parentId"];
	        this.path = source["path"];
	        this.createdAt = this.convertValues(source["createdAt"], FlexibleTime);
	        this.updatedAt = this.convertValues(source["updatedAt"], FlexibleTime);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GroupNode {
	    group?: Group;
	    children: GroupNode[];
	
	    static createFrom(source: any = {}) {
	        return new GroupNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.group = this.convertValues(source["group"], Group);
	        this.children = this.convertValues(source["children"], GroupNode);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Session {
	    id: string;
	    name: string;
	    group: string;
	    description: string;
	    protocol: string;
	    host: string;
	    port: number;
	    user: string;
	    authType: string;
	    password: string;
	    keyPath: string;
	    keyPassphrase: string;
	    keepAlive: number;
	    proxyJump: string;
	    proxyCommand: string;
	    terminalType: string;
	    fontSize: number;
	    fontFamily: string;
	    themeId: string;
	    encoding: string;
	    dataBits: number;
	    stopBits: number;
	    parity: string;
	    noNegotiation: boolean;
	    localEnv: string[];
	    loginScript: string[];
	    createdAt: FlexibleTime;
	    updatedAt: FlexibleTime;
	    lastUsedAt: FlexibleTime;
	    tags: string[];
	
	    static createFrom(source: any = {}) {
	        return new Session(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.group = source["group"];
	        this.description = source["description"];
	        this.protocol = source["protocol"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.authType = source["authType"];
	        this.password = source["password"];
	        this.keyPath = source["keyPath"];
	        this.keyPassphrase = source["keyPassphrase"];
	        this.keepAlive = source["keepAlive"];
	        this.proxyJump = source["proxyJump"];
	        this.proxyCommand = source["proxyCommand"];
	        this.terminalType = source["terminalType"];
	        this.fontSize = source["fontSize"];
	        this.fontFamily = source["fontFamily"];
	        this.themeId = source["themeId"];
	        this.encoding = source["encoding"];
	        this.dataBits = source["dataBits"];
	        this.stopBits = source["stopBits"];
	        this.parity = source["parity"];
	        this.noNegotiation = source["noNegotiation"];
	        this.localEnv = source["localEnv"];
	        this.loginScript = source["loginScript"];
	        this.createdAt = this.convertValues(source["createdAt"], FlexibleTime);
	        this.updatedAt = this.convertValues(source["updatedAt"], FlexibleTime);
	        this.lastUsedAt = this.convertValues(source["lastUsedAt"], FlexibleTime);
	        this.tags = source["tags"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace version {
	
	export class AppInfo {
	    name: string;
	    version: string;
	    buildTime: string;
	    gitCommit: string;
	    goVersion: string;
	    platform: string;
	    author: string;
	    email: string;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new AppInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.version = source["version"];
	        this.buildTime = source["buildTime"];
	        this.gitCommit = source["gitCommit"];
	        this.goVersion = source["goVersion"];
	        this.platform = source["platform"];
	        this.author = source["author"];
	        this.email = source["email"];
	        this.description = source["description"];
	    }
	}

}

