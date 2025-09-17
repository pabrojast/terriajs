import { computed, makeObservable } from "mobx";
import TerriaError from "../../../Core/TerriaError";
import { InfoSectionTraits } from "../../../Traits/TraitsClasses/CatalogMemberTraits";
import StacCatalogGroupTraits from "../../../Traits/TraitsClasses/StacCatalogGroupTraits";
import createStratumInstance from "../../Definition/createStratumInstance";
import LoadableStratum from "../../Definition/LoadableStratum";
import { BaseModel } from "../../Definition/Model";
import {
  StacApiClient,
  StacCollection,
  StacLink
} from "./StacApiHelpers";

export class StacCollectionStratum extends LoadableStratum(StacCatalogGroupTraits) {
  static stratumName = "stacCollection";

  static async load(
    catalogGroup: any, // StacCatalogGroup type would be circular
    collectionId: string
  ): Promise<StacCollectionStratum> {
    if (!catalogGroup.url) {
      throw new TerriaError({
        title: "STAC Collection Error",
        message: "URL must be set for STAC Collection"
      });
    }

    const client = new StacApiClient(catalogGroup.url, catalogGroup.authToken);
    
    try {
      const collection = await client.getCollection(collectionId);
      
      // Get queryables if supported
      let queryables;
      try {
        const queryablesUrl = `${catalogGroup.url}collections/${collectionId}/queryables`;
        queryables = await client.fetchJson(queryablesUrl);
      } catch (_error) {
        // Queryables not supported, continue without them
        console.debug(`Queryables not available for collection ${collectionId}`);
      }

      return new StacCollectionStratum(catalogGroup, collection, queryables);
    } catch (error) {
      throw new TerriaError({
        title: "Failed to load STAC collection",
        message: `Error loading collection ${collectionId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      });
    }
  }

  constructor(
    readonly catalogGroup: any,
    readonly collection: StacCollection,
    readonly queryables?: any
  ) {
    super();
    makeObservable(this);
  }

  duplicateLoadableStratum(newModel: BaseModel): this {
    return new StacCollectionStratum(
      newModel,
      this.collection,
      this.queryables
    ) as this;
  }

  @computed get name(): string {
    return this.collection.title || this.collection.id;
  }

  @computed get description(): string | undefined {
    let desc = this.collection.description || "";
    
    // Add extent information
    if (this.collection.extent) {
      desc += this.getExtentDescription();
    }

    // Add provider information
    if (this.collection.providers && this.collection.providers.length > 0) {
      desc += this.getProvidersDescription();
    }

    // Add keywords
    if (this.collection.keywords && this.collection.keywords.length > 0) {
      desc += `\n\n**Keywords:** ${this.collection.keywords.join(", ")}`;
    }

    return desc.trim() || undefined;
  }

  @computed get info(): any[] {
    const sections: any[] = [];

    // Collection metadata section
    sections.push({
      name: "Collection Details",
      content: this.getCollectionDetailsContent(),
      show: true
    });

    // Spatial extent section
    if (this.collection.extent.spatial.bbox.length > 0) {
      sections.push({
        name: "Spatial Coverage",
        content: this.getSpatialExtentContent(),
        show: false
      });
    }

    // Temporal extent section
    if (this.collection.extent.temporal.interval.length > 0) {
      sections.push({
        name: "Temporal Coverage", 
        content: this.getTemporalExtentContent(),
        show: false
      });
    }

    // Queryable properties section
    if (this.queryables) {
      sections.push({
        name: "Searchable Properties",
        content: this.getQueryablesContent(),
        show: false
      });
    }

    // Assets section
    if (this.collection.assets) {
      sections.push(createStratumInstance(InfoSectionTraits, {
        name: "Collection Assets",
        content: this.getAssetsContent(),
        show: false
      }));
    }

    // Links section
    if (this.collection.links && this.collection.links.length > 0) {
      sections.push(createStratumInstance(InfoSectionTraits, {
        name: "Related Links",
        content: this.getLinksContent(),
        show: false
      }));
    }

    return sections;
  }

  private getExtentDescription(): string {
    let desc = "";
    
    const spatial = this.collection.extent.spatial;
    const temporal = this.collection.extent.temporal;

    if (spatial.bbox.length > 0) {
      const bbox = spatial.bbox[0];
      desc += `\n\n**Spatial Coverage:** ${bbox[0]}, ${bbox[1]} to ${bbox[2]}, ${bbox[3]}`;
    }

    if (temporal.interval.length > 0) {
      const interval = temporal.interval[0];
      const start = interval[0] || "Open";
      const end = interval[1] || "Ongoing";
      desc += `\n\n**Temporal Coverage:** ${start} to ${end}`;
    }

    return desc;
  }

  private getProvidersDescription(): string {
    if (!this.collection.providers || this.collection.providers.length === 0) {
      return "";
    }

    let desc = "\n\n**Data Providers:**\n";
    this.collection.providers.forEach(provider => {
      desc += `- **${provider.name}**`;
      if (provider.description) {
        desc += `: ${provider.description}`;
      }
      if (provider.roles && provider.roles.length > 0) {
        desc += ` (${provider.roles.join(", ")})`;
      }
      desc += "\n";
    });

    return desc;
  }

  private getCollectionDetailsContent(): string {
    let content = "";

    content += `**Collection ID:** ${this.collection.id}\n\n`;
    
    if (this.collection.license) {
      content += `**License:** ${this.collection.license}\n\n`;
    }

    if (this.collection.stac_version) {
      content += `**STAC Version:** ${this.collection.stac_version}\n\n`;
    }

    if (this.collection.stac_extensions && this.collection.stac_extensions.length > 0) {
      content += `**STAC Extensions:**\n`;
      this.collection.stac_extensions.forEach(ext => {
        content += `- ${ext}\n`;
      });
      content += "\n";
    }

    if (this.collection.summaries) {
      content += `**Data Summaries:**\n`;
      Object.entries(this.collection.summaries).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          content += `- **${key}:** ${value.join(", ")}\n`;
        } else if (typeof value === "object" && value !== null) {
          if ('minimum' in value && 'maximum' in value) {
            content += `- **${key}:** ${value.minimum} - ${value.maximum}\n`;
          } else {
            content += `- **${key}:** ${JSON.stringify(value)}\n`;
          }
        } else {
          content += `- **${key}:** ${value}\n`;
        }
      });
    }

    return content;
  }

  private getSpatialExtentContent(): string {
    let content = "";
    
    this.collection.extent.spatial.bbox.forEach((bbox, index) => {
      content += `**Bounding Box ${index + 1}:**\n`;
      content += `- West: ${bbox[0]}°\n`;
      content += `- South: ${bbox[1]}°\n`;  
      content += `- East: ${bbox[2]}°\n`;
      content += `- North: ${bbox[3]}°\n\n`;
    });

    return content;
  }

  private getTemporalExtentContent(): string {
    let content = "";

    this.collection.extent.temporal.interval.forEach((interval, index) => {
      content += `**Time Period ${index + 1}:**\n`;
      content += `- Start: ${interval[0] || "Open"}\n`;
      content += `- End: ${interval[1] || "Ongoing"}\n\n`;
    });

    return content;
  }

  private getQueryablesContent(): string {
    if (!this.queryables || !this.queryables.properties) {
      return "No queryable properties available.";
    }

    let content = "Available search properties:\n\n";

    Object.entries(this.queryables.properties).forEach(([key, property]: [string, any]) => {
      content += `**${key}**\n`;
      
      if (property.title) {
        content += `- Title: ${property.title}\n`;
      }
      
      if (property.description) {
        content += `- Description: ${property.description}\n`;
      }
      
      if (property.type) {
        content += `- Type: ${property.type}\n`;
      }
      
      if (property.enum && property.enum.length > 0) {
        content += `- Values: ${property.enum.join(", ")}\n`;
      }
      
      content += "\n";
    });

    return content;
  }

  private getAssetsContent(): string {
    if (!this.collection.assets) {
      return "No collection-level assets available.";
    }

    let content = "";

    Object.entries(this.collection.assets).forEach(([key, asset]) => {
      content += `**${key}**\n`;
      
      if (asset.title) {
        content += `- Title: ${asset.title}\n`;
      }
      
      if (asset.description) {
        content += `- Description: ${asset.description}\n`;
      }
      
      if (asset.type) {
        content += `- Media Type: ${asset.type}\n`;
      }
      
      if (asset.roles && asset.roles.length > 0) {
        content += `- Roles: ${asset.roles.join(", ")}\n`;
      }
      
      content += `- URL: [${asset.href}](${asset.href})\n\n`;
    });

    return content;
  }

  private getLinksContent(): string {
    let content = "";
    
    // Group links by relation type
    const linkGroups: Record<string, StacLink[]> = {};
    
    this.collection.links.forEach(link => {
      if (!linkGroups[link.rel]) {
        linkGroups[link.rel] = [];
      }
      linkGroups[link.rel].push(link);
    });

    Object.entries(linkGroups).forEach(([rel, links]) => {
      content += `**${rel}**\n`;
      
      links.forEach(link => {
        const title = link.title || link.href;
        content += `- [${title}](${link.href})`;
        
        if (link.type) {
          content += ` (${link.type})`;
        }
        
        content += "\n";
      });
      
      content += "\n";
    });

    return content;
  }
}