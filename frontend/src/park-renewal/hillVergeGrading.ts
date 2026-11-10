/** Redistribute the climb by elevation band, preserving the pavilion pad and +22 m summit.
 * The crowded inner verges at 16.5–18 m and 20.5–21.5 m rise more slowly;
 * the extra ascent is spread over the longer, gentler connecting sections.
 */
const bottom=11.53076923076923,top=22
const bands=[[bottom,1],[12.25,1.04],[13.25,1.12],[14.25,1.03],[15.25,1.03],[16.25,.94],[16.6,.8],[17.5,.8],[18.2,1.02],[18.8,.88],[19.2,.94],[19.7,1.19],[20.1,1.14],[20.6,.84],[21.2,.84],[21.7,1.12],[top,1]] as const
const area=bands.slice(1).reduce((sum,b,i)=>sum+(b[0]-bands[i]![0])*(b[1]+bands[i]![1])/2,0)
export function hillVergeHeight(height:number){
 if(height<=bottom||height>=top)return height
 let integral=0
 for(let i=1;i<bands.length;i++){const a=bands[i-1]!,b=bands[i]!,d=Math.min(height,b[0])-a[0];if(d<=0)break;integral+=a[1]*d+(b[1]-a[1])*d*d/(2*(b[0]-a[0]));if(height<=b[0])break}
 return bottom+integral*(top-bottom)/area
}
