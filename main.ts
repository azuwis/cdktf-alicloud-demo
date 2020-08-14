import { Construct } from 'constructs';
import { App, TerraformStack } from 'cdktf';
import * as alicloud from './.gen/providers/alicloud';

class MyStack extends TerraformStack {
  resourceGroup: string;
  imageId: string;
  keyName: string;
  vpcs: {[id: string]: alicloud.Vpc} = {}
  securityGroups: {[id: string]: alicloud.SecurityGroup} = {};
  vswitches: {[id: string]: alicloud.Vswitch} = {};

  constructor(scope: Construct, name: string, accessKey: string, secretKey: string,
     region: string, resourceGroup: string) {
    super(scope, name);

    this.resourceGroup = resourceGroup;

    new alicloud.AlicloudProvider(this, 'alicloud', {
      region,
      accessKey,
      secretKey,
    });

    this.imageId = new alicloud.DataAlicloudImages(this, 'images-debian-10', {
      owners: 'self',
      nameRegex: '^debian-10$',
    }).images('0').id;

    this.keyName = new alicloud.KeyPair(this, 'key-pair-test', {
      resourceGroupId: this.resourceGroup,
      keyName: 'test',
      publicKey: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ...',
    }).keyName!;
  }

  createVpc(name: string, cidrBlock: string, vswitches: {[id: string]: string}) {
    this.vpcs[name] = new alicloud.Vpc(this, `vpc-${name}`, {
      resourceGroupId: this.resourceGroup,
      name,
      cidrBlock,
    });

    this.securityGroups[name] = new alicloud.SecurityGroup(this, `security-group-${name}`, {
      resourceGroupId: this.resourceGroup,
      name,
      vpcId: this.vpcs[name].id,
    });

    new alicloud.SecurityGroupRule(this, `security-group-rule-${name}`, {
      type: 'ingress',
      ipProtocol: 'tcp',
      cidrIp: '0.0.0.0/0',
      portRange: '22/22',
      securityGroupId: this.securityGroups[name].id!,
    });

    for (let availabilityZone in vswitches) {
      let cidrBlock = vswitches[availabilityZone];
      this.vswitches[`${name}-${availabilityZone}`] = new alicloud.Vswitch(this, `vswitch-${name}-${availabilityZone}`, {
        vpcId: this.vpcs[name].id!,
        cidrBlock,
        availabilityZone,
      });
    }
  }

  createInstance(name: string, vpcName: string, availabilityZone: string, type='ecs.t5-lc2m1.nano') {
    const instance = new alicloud.Instance(this, `instance-${name}`, {
      resourceGroupId: this.resourceGroup,
      availabilityZone,
      securityGroups: [this.securityGroups[vpcName].id!],
      instanceType: type,
      systemDiskSize: 20,
      imageId: this.imageId,
      instanceName: name,
      vswitchId: this.vswitches[`${vpcName}-${availabilityZone}`].id,
      keyName: this.keyName,
    });

    const eip = new alicloud.Eip(this, `eip-${name}`, {
      resourceGroupId: this.resourceGroup,
      bandwidth: 5,
      internetChargeType: 'PayByTraffic',
    });

    new alicloud.EipAssociation(this, `eip-association-${name}`, {
      allocationId: eip.id!,
      instanceId: instance.id!,
    });
  };
}

const app = new App();

import { accessKey, secretKey } from './secret';
const myStack = new MyStack(app, 'alicloud-demo', accessKey, secretKey,
  'cn-hangzhou', 'rg-...');
myStack.createVpc('vpc1', '172.16.0.0/12', {
  'cn-hangzhou-h': '172.16.0.0/21',
})
myStack.createInstance('instance1', 'vpc1', 'cn-hangzhou-h');

app.synth();
