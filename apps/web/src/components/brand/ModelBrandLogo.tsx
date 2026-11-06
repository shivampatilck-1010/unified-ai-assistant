import React from 'react';
import { CompanyLogo, type CompanyLogoProps } from './CompanyLogo';

export type ModelBrandLogoProps = CompanyLogoProps;

/**
 * ModelBrandLogo forwards directly to the official CompanyLogo component,
 * ensuring all brand logos use authentic SVG vectors sourced from official guidelines.
 */
export const ModelBrandLogo: React.FC<ModelBrandLogoProps> = (props) => {
  return <CompanyLogo {...props} />;
};
